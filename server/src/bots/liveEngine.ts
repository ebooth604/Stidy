import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "../db/client.js";
import { botsTable, livePositionsTable, liveTradesTable } from "../db/schema.js";
import type { LiveExchange } from "../hyperliquid/liveExchange.js";
import { isLiveTradingConfigured } from "../hyperliquid/liveExchange.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type { SignalEngine } from "../signals/engine.js";
import { computePnl } from "./riskManager.js";
import { evaluateBasisReversion } from "./strategies/basisReversion.js";
import { evaluateCmcBasisReversion } from "./strategies/cmcBasisReversion.js";
import { evaluateFundingReversion } from "./strategies/fundingReversion.js";
import type { BotConfig, StrategyName, TradeIntent } from "./types.js";

function stopLossPrice(side: "long" | "short", entry: number, pct: number): number {
  return side === "long" ? entry * (1 - pct / 100) : entry * (1 + pct / 100);
}

function takeProfitPrice(side: "long" | "short", entry: number, pct: number): number {
  return side === "long" ? entry * (1 + pct / 100) : entry * (1 - pct / 100);
}

function evaluateStrategy(strategy: StrategyName, signals: ReturnType<SignalEngine["getLatestSignals"]>) {
  return (botConfig: BotConfig, heldCoins: ReadonlySet<string>): TradeIntent[] => {
    if (strategy === "basis_reversion") return evaluateBasisReversion(signals.basis, botConfig, heldCoins);
    if (strategy === "cmc_basis_reversion") return evaluateCmcBasisReversion(signals.cmcBasis, botConfig, heldCoins);
    return evaluateFundingReversion(signals.funding, botConfig, heldCoins);
  };
}

/** Real-money counterpart to BotEngine. Structurally mirrors it (protect open
 * positions every tick, open new ones for eligible bots) but:
 *   - only ever processes bots with config.liveTrading === true
 *   - never starts at all unless isLiveTradingConfigured() — so a bot flagged
 *     liveTrading:true in the DB is inert until the operator sets real env vars
 *   - sizes/risk-checks against the REAL account (withdrawable margin), not a
 *     synthetic paper balance
 *   - records to live_positions/live_trades, never touching the paper tables
 */
export class LiveTradingEngine {
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private tickRunning = false;

  constructor(
    private db: AppDb,
    private signalEngine: SignalEngine,
    private exchange: LiveExchange | null,
  ) {}

  start(): void {
    if (!isLiveTradingConfigured()) {
      logger.info("[live] not configured — live trading engine will not start");
      return;
    }
    this.tick();
    this.tickTimer = setInterval(() => this.tick(), config.bots.tickMs);
    logger.warn("[live] LIVE TRADING ENGINE STARTED — real orders may be placed");
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
  }

  private tick(): void {
    if (this.tickRunning) return;
    this.tickRunning = true;
    void this.runTick().catch((err) => logger.error({ err }, "[live] tick failed")).finally(() => {
      this.tickRunning = false;
    });
  }

  private async runTick(): Promise<void> {
    await this.checkStops();

    const bots = this.db
      .select()
      .from(botsTable)
      .all()
      .filter((b) => {
        if (!b.enabled) return false;
        const botConfig = JSON.parse(b.config) as BotConfig;
        return botConfig.liveTrading === true;
      });

    const now = Date.now();
    for (const bot of bots) {
      const elapsedMs = bot.lastRunAt ? now - bot.lastRunAt.getTime() : Infinity;
      if (elapsedMs < bot.pollIntervalSeconds * 1000) continue;

      try {
        await this.runBot(bot.id, bot.strategy as StrategyName, JSON.parse(bot.config) as BotConfig);
      } catch (err) {
        logger.error({ err, botId: bot.id }, "[live] tick failed for bot");
      }

      this.db
        .update(botsTable)
        .set({ lastRunAt: new Date(now), updatedAt: new Date(now) })
        .where(eq(botsTable.id, bot.id))
        .run();
    }
  }

  private async runBot(botId: string, strategy: StrategyName, botConfig: BotConfig): Promise<void> {
    if (!this.exchange) return; // live trading was turned off after this bot was flagged
    if (botConfig.positionSizeUsd > config.liveTrading.maxOrderUsd) {
      logger.warn(
        { botId, positionSizeUsd: botConfig.positionSizeUsd, cap: config.liveTrading.maxOrderUsd },
        "[live] bot's positionSizeUsd exceeds the live order cap — skipping",
      );
      return;
    }

    const openPositions = this.db
      .select()
      .from(livePositionsTable)
      .where(and(eq(livePositionsTable.botId, botId), eq(livePositionsTable.status, "open")))
      .all();

    const slotsLeft = botConfig.maxPositions - openPositions.length;
    if (slotsLeft <= 0) return;

    // Real risk gate: don't open new positions beyond available margin.
    const account = await this.exchange.getAccountState();
    if (account.withdrawable < botConfig.positionSizeUsd) {
      logger.info({ botId, withdrawable: account.withdrawable }, "[live] insufficient withdrawable margin — skipping");
      return;
    }

    const heldCoins = new Set(openPositions.map((p) => p.coin));
    const signals = this.signalEngine.getLatestSignals();
    const intents = evaluateStrategy(strategy, signals)(botConfig, heldCoins);

    let opened = 0;
    for (const intent of intents) {
      if (opened >= slotsLeft) break;

      let fill;
      try {
        fill = await this.exchange.placeMarketOrder({
          coin: intent.coin,
          side: intent.side,
          sizeUsd: botConfig.positionSizeUsd,
          referencePrice: intent.entryPrice,
          reduceOnly: false,
        });
      } catch (err) {
        logger.error({ err, botId, coin: intent.coin }, "[live] order failed — skipping this signal");
        continue;
      }

      const stopLoss = stopLossPrice(intent.side, fill.avgPrice, botConfig.stopLossPct);
      const takeProfit = takeProfitPrice(intent.side, fill.avgPrice, botConfig.takeProfitPct);

      this.db
        .insert(livePositionsTable)
        .values({
          id: randomUUID(),
          botId,
          coin: intent.coin,
          side: intent.side,
          quantity: fill.filledQty,
          entryPrice: fill.avgPrice,
          stopLoss,
          takeProfit,
          signalId: intent.signalId,
          status: "open",
        })
        .run();

      opened++;
      heldCoins.add(intent.coin);
      logger.warn(
        { botId, coin: intent.coin, side: intent.side, avgPrice: fill.avgPrice, qty: fill.filledQty },
        "[live] OPENED real position",
      );
    }
  }

  private async checkStops(): Promise<void> {
    const openPositions = this.db
      .select()
      .from(livePositionsTable)
      .where(eq(livePositionsTable.status, "open"))
      .all();

    for (const pos of openPositions) {
      const currentPrice = this.signalEngine.getPriceForCoin(pos.coin);
      if (currentPrice === null) continue;

      let closeReason: "stop_loss" | "take_profit" | null = null;
      if (pos.side === "long") {
        if (currentPrice <= pos.stopLoss) closeReason = "stop_loss";
        else if (currentPrice >= pos.takeProfit) closeReason = "take_profit";
      } else {
        if (currentPrice >= pos.stopLoss) closeReason = "stop_loss";
        else if (currentPrice <= pos.takeProfit) closeReason = "take_profit";
      }
      if (!closeReason) continue;

      await this.closePosition(pos, currentPrice, closeReason);
    }
  }

  private async closePosition(
    pos: typeof livePositionsTable.$inferSelect,
    referencePrice: number,
    closeReason: "stop_loss" | "take_profit" | "manual",
  ): Promise<void> {
    if (!this.exchange) {
      logger.error({ positionId: pos.id }, "[live] cannot close — live trading is no longer configured");
      return;
    }
    const closingSide: "long" | "short" = pos.side === "long" ? "short" : "long";

    let fill;
    try {
      fill = await this.exchange.placeMarketOrder({
        coin: pos.coin,
        side: closingSide,
        quantity: pos.quantity,
        referencePrice,
        reduceOnly: true,
      });
    } catch (err) {
      logger.error({ err, positionId: pos.id }, "[live] close order failed — will retry next tick");
      return;
    }

    const { pnl, pnlPct } = computePnl(pos.side as "long" | "short", pos.quantity, pos.entryPrice, fill.avgPrice);
    const now = new Date();

    this.db.transaction((tx) => {
      const closed = tx
        .update(livePositionsTable)
        .set({
          status: closeReason === "stop_loss" ? "stopped" : "closed",
          pnl,
          pnlPct,
          closedPrice: fill.avgPrice,
          closedAt: now,
        })
        .where(and(eq(livePositionsTable.id, pos.id), eq(livePositionsTable.status, "open")))
        .run();
      if (closed.changes === 0) return;

      tx.insert(liveTradesTable)
        .values({
          id: randomUUID(),
          botId: pos.botId,
          positionId: pos.id,
          coin: pos.coin,
          side: pos.side,
          quantity: pos.quantity,
          entryPrice: pos.entryPrice,
          exitPrice: fill.avgPrice,
          closeReason,
          pnl,
          pnlPct,
          openedAt: pos.openedAt,
          closedAt: now,
        })
        .run();
    });

    logger.warn({ positionId: pos.id, coin: pos.coin, closeReason, pnl }, "[live] CLOSED real position");
  }

  /** Manual close via the API. Returns false if already closed. */
  async closePositionManually(positionId: string): Promise<boolean> {
    const pos = this.db
      .select()
      .from(livePositionsTable)
      .where(and(eq(livePositionsTable.id, positionId), eq(livePositionsTable.status, "open")))
      .get();
    if (!pos) return false;

    const currentPrice = this.signalEngine.getPriceForCoin(pos.coin) ?? pos.entryPrice;
    await this.closePosition(pos, currentPrice, "manual");
    return true;
  }
}
