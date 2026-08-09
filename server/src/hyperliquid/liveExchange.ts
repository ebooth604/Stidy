import * as hl from "@nktkas/hyperliquid";
import { formatPrice, formatSize, SymbolConverter } from "@nktkas/hyperliquid/utils";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

/** Real-money trading. Only true when the operator has explicitly set the
 * kill switch AND supplied both an API wallet key and the master account
 * address — any one missing means live trading is fully inert.
 */
export function isLiveTradingConfigured(): boolean {
  const lt = config.liveTrading;
  return lt.enabled && Boolean(lt.apiWalletPrivateKey) && Boolean(lt.accountAddress);
}

export interface LiveAccountPosition {
  coin: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  unrealizedPnl: number;
  liquidationPx: number | null;
}

export interface LiveAccountState {
  accountValue: number;
  withdrawable: number;
  totalMarginUsed: number;
  positions: LiveAccountPosition[];
}

export interface OrderFill {
  filledQty: number;
  avgPrice: number;
}

export interface PlaceMarketOrderParams {
  coin: string;
  /** Direction of THIS order (the side being bought into). */
  side: "long" | "short";
  /** Notional USD to size the order from — ignored if `quantity` is given. */
  sizeUsd?: number;
  /** Exact base-asset quantity to trade, e.g. closing a specific open position.
   * Takes precedence over `sizeUsd` when both are present. */
  quantity?: number;
  /** Current mark/oracle price used to compute the aggressive-IOC limit price
   * (and, when `quantity` isn't given, the order size). */
  referencePrice: number;
  reduceOnly: boolean;
}

/** Everything the live trading engine needs — kept as an interface so tests
 * can inject a fake implementation instead of touching the real network or
 * signing real orders.
 */
export interface LiveExchange {
  getAccountState(): Promise<LiveAccountState>;
  placeMarketOrder(params: PlaceMarketOrderParams): Promise<OrderFill>;
}

/** Hyperliquid has no native "market order" type — this emulates one as an
 * Immediate-or-Cancel limit order priced aggressively past the reference
 * price by `slippageBps`, guaranteeing it either fills (partially or fully)
 * immediately or cancels outright, never rests on the book.
 */
export class HyperliquidLiveExchange implements LiveExchange {
  private readonly exchangeClient: InstanceType<typeof hl.ExchangeClient>;
  private readonly infoClient: InstanceType<typeof hl.InfoClient>;
  private converterPromise: Promise<SymbolConverter> | null = null;

  constructor() {
    if (!isLiveTradingConfigured()) {
      throw new Error(
        "Live trading is not configured — set HYPERLIQUID_LIVE_TRADING_ENABLED=true, " +
          "HYPERLIQUID_API_WALLET_PRIVATE_KEY, and HYPERLIQUID_ACCOUNT_ADDRESS.",
      );
    }
    const wallet = privateKeyToAccount(config.liveTrading.apiWalletPrivateKey as `0x${string}`);
    const transport = new hl.HttpTransport({ apiUrl: config.hyperliquid.apiUrl });
    this.exchangeClient = new hl.ExchangeClient({ transport, wallet });
    this.infoClient = new hl.InfoClient({ transport });
    logger.info({ accountAddress: config.liveTrading.accountAddress }, "[live] exchange client initialized");
  }

  private getConverter(): Promise<SymbolConverter> {
    if (!this.converterPromise) {
      const transport = new hl.HttpTransport({ apiUrl: config.hyperliquid.apiUrl });
      this.converterPromise = SymbolConverter.create({ transport });
    }
    return this.converterPromise;
  }

  async getAccountState(): Promise<LiveAccountState> {
    const state = await this.infoClient.clearinghouseState({
      user: config.liveTrading.accountAddress as `0x${string}`,
    });
    return {
      accountValue: Number(state.marginSummary.accountValue),
      withdrawable: Number(state.withdrawable),
      totalMarginUsed: Number(state.marginSummary.totalMarginUsed),
      positions: state.assetPositions.map((p): LiveAccountPosition => {
        const szi = Number(p.position.szi);
        return {
          coin: p.position.coin,
          side: szi >= 0 ? "long" : "short",
          quantity: Math.abs(szi),
          entryPrice: Number(p.position.entryPx),
          unrealizedPnl: Number(p.position.unrealizedPnl),
          liquidationPx: p.position.liquidationPx ? Number(p.position.liquidationPx) : null,
        };
      }),
    };
  }

  async placeMarketOrder(params: PlaceMarketOrderParams): Promise<OrderFill> {
    const { coin, side, sizeUsd, quantity, referencePrice, reduceOnly } = params;
    if (quantity === undefined && sizeUsd === undefined) {
      throw new Error("placeMarketOrder requires either sizeUsd or quantity");
    }

    // Hard ceiling, enforced here regardless of what a bot's own config says —
    // the last line of defense against a misconfigured or AI-suggested bot.
    const notionalUsd = quantity !== undefined ? quantity * referencePrice : (sizeUsd as number);
    if (notionalUsd > config.liveTrading.maxOrderUsd) {
      throw new Error(
        `Refusing order: $${notionalUsd.toFixed(2)} exceeds the configured live-trading cap of $${config.liveTrading.maxOrderUsd} (HYPERLIQUID_LIVE_MAX_ORDER_USD)`,
      );
    }

    const converter = await this.getConverter();
    const assetId = converter.getAssetId(coin);
    const szDecimals = converter.getSzDecimals(coin);
    if (assetId === undefined || szDecimals === undefined) {
      throw new Error(`Unknown Hyperliquid asset: ${coin}`);
    }

    const isBuy = side === "long";
    const slippageMult = isBuy
      ? 1 + config.liveTrading.slippageBps / 10_000
      : 1 - config.liveTrading.slippageBps / 10_000;
    const limitPrice = formatPrice(referencePrice * slippageMult, szDecimals, "perp");
    const size = formatSize(quantity ?? (sizeUsd as number) / referencePrice, szDecimals);

    logger.info({ coin, side, sizeUsd, limitPrice, size, reduceOnly }, "[live] placing order");

    const result = await this.exchangeClient.order({
      orders: [
        {
          a: assetId,
          b: isBuy,
          p: limitPrice,
          s: size,
          r: reduceOnly,
          t: { limit: { tif: "Ioc" } },
        },
      ],
      grouping: "na",
    });

    const status = result.response.data.statuses[0];
    if (status && typeof status === "object" && "filled" in status) {
      return { filledQty: Number(status.filled.totalSz), avgPrice: Number(status.filled.avgPx) };
    }
    if (status && typeof status === "object" && "error" in status) {
      throw new Error(`Order rejected: ${status.error}`);
    }
    throw new Error(`Order did not fill immediately (IOC, status=${JSON.stringify(status)})`);
  }
}

let singleton: HyperliquidLiveExchange | null = null;

export function getLiveExchange(): LiveExchange {
  if (!singleton) singleton = new HyperliquidLiveExchange();
  return singleton;
}
