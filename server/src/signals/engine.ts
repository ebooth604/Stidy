import type { AppDb } from "../db/client.js";
import { signalsTable } from "../db/schema.js";
import { getSpotPricesSafe, isCmcConfigured, toCmcSymbol } from "../external/coinmarketcap.js";
import { fetchAssetSnapshots } from "../hyperliquid/client.js";
import type { AssetSnapshot } from "../hyperliquid/types.js";
import { HyperliquidWsClient } from "../hyperliquid/ws.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { computeBasisSignals } from "./basis.js";
import { computeCmcBasisSignals } from "./cmcBasis.js";
import { computeFundingSignals } from "./funding.js";
import type { Signal } from "./types.js";
import { WhaleTradeTracker } from "./whales.js";

const TOP_COINS_FOR_WHALE_TRACKING = 25;
const RECENT_WHALE_TRADES_KEPT = 200;

/** Polls Hyperliquid REST for basis/funding signals and streams the WS trades
 * feed for whale prints. Holds the latest results in memory (for fast API
 * reads and the bot engine) while also persisting every fired signal to
 * SQLite for history/backtesting.
 */
export class SignalEngine {
  private ws = new HyperliquidWsClient();
  private whaleTracker = new WhaleTradeTracker(config.signals.whaleTradeUsd);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  private latestSnapshots: AssetSnapshot[] = [];
  private latestBasis: Signal[] = [];
  private latestFunding: Signal[] = [];
  private latestCmcBasis: Signal[] = [];
  private recentWhaleTrades: Signal[] = [];
  private lastCmcFetchAt = 0;

  constructor(private db: AppDb) {}

  start(): void {
    this.ws.connect();
    this.ws.on("trade", (trades) => {
      const fired = this.whaleTracker.ingest(trades);
      if (fired.length === 0) return;
      this.recentWhaleTrades = [...fired, ...this.recentWhaleTrades].slice(
        0,
        RECENT_WHALE_TRADES_KEPT,
      );
      for (const s of fired) this.persist(s);
    });

    void this.poll();
    this.pollTimer = setInterval(() => void this.poll(), config.signals.pollIntervalMs);
    logger.info("[signals] engine started");
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.ws.close();
  }

  private async poll(): Promise<void> {
    try {
      const snapshots = await fetchAssetSnapshots();
      this.latestSnapshots = snapshots;

      this.latestBasis = computeBasisSignals(snapshots, config.signals.basisGapAlertPct);
      this.latestFunding = computeFundingSignals(snapshots, config.signals.fundingAprAlertPct);
      for (const s of [...this.latestBasis, ...this.latestFunding]) this.persist(s);

      const byVolume = [...snapshots].sort((a, b) => b.dayNtlVlm - a.dayNtlVlm);
      const topCoins = byVolume.slice(0, TOP_COINS_FOR_WHALE_TRACKING).map((s) => s.coin);
      this.ws.syncTradeSubscriptions(topCoins);

      await this.maybePollCmc(byVolume);
    } catch (err) {
      logger.error({ err }, "[signals] poll failed");
    }
  }

  /** CMC's free tier wants a floor on request frequency, independent of the
   * (much faster) Hyperliquid poll cadence — so this only actually fetches
   * once every config.cmc.pollIntervalMs, and only for a small watchlist.
   */
  private async maybePollCmc(byVolume: AssetSnapshot[]): Promise<void> {
    if (!isCmcConfigured()) return;
    const now = Date.now();
    if (now - this.lastCmcFetchAt < config.cmc.pollIntervalMs) return;
    this.lastCmcFetchAt = now;

    const watchlist = byVolume.slice(0, config.cmc.watchlistSize);
    const symbols = [...new Set(watchlist.map((s) => toCmcSymbol(s.coin)))];
    const prices = await getSpotPricesSafe(symbols);
    if (Object.keys(prices).length === 0) return;

    this.latestCmcBasis = computeCmcBasisSignals(watchlist, prices, config.cmc.basisGapAlertPct);
    for (const s of this.latestCmcBasis) this.persist(s);
  }

  private persist(signal: Signal): void {
    try {
      this.db
        .insert(signalsTable)
        .values({
          id: signal.id,
          type: signal.type,
          coin: signal.coin,
          value: signal.value,
          direction: signal.direction,
          context: JSON.stringify(signal.context),
          createdAt: new Date(signal.createdAt),
        })
        .run();
    } catch (err) {
      logger.error({ err }, "[signals] persist failed");
    }
  }

  getSnapshots(): AssetSnapshot[] {
    return this.latestSnapshots;
  }

  getLatestSignals(): { basis: Signal[]; funding: Signal[]; whaleTrades: Signal[]; cmcBasis: Signal[] } {
    return {
      basis: this.latestBasis,
      funding: this.latestFunding,
      whaleTrades: this.recentWhaleTrades,
      cmcBasis: this.latestCmcBasis,
    };
  }

  getWhaleImbalances() {
    return this.whaleTracker.getImbalances();
  }

  getPriceForCoin(coin: string): number | null {
    const snap = this.latestSnapshots.find((s) => s.coin === coin);
    return snap ? snap.markPx : null;
  }
}
