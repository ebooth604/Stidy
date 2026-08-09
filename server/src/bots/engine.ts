import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "../db/client.js";
import { SINGLETON_ACCOUNT_ID } from "../db/client.js";
import { botsTable, paperAccountTable, paperPositionsTable, paperTradesTable } from "../db/schema.js";
import type { SignalEngine } from "../signals/engine.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { computePnl, passesDrawdownGate } from "./riskManager.js";
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
  return (config: BotConfig, heldCoins: ReadonlySet<string>): TradeIntent[] => {
    if (strategy === "basis_reversion") return evaluateBasisReversion(signals.basis, config, heldCoins);
    if (strategy === "cmc_basis_reversion") return evaluateCmcBasisReversion(signals.cmcBasis, config, heldCoins);
    return evaluateFundingReversion(signals.funding, config, heldCoins);
  };
}

/** Runs the paper-trading tick loop: protects open positions with stop-loss /
 * take-profit on every tick, then opens new positions for enabled bots whose
 * poll interval has elapsed. Every state change (open, close, balance) is a
 * single synchronous better-sqlite3 transaction, so — unlike a Postgres
 * multi-process setup — there's no interleaving to guard against within one.
 */
export class BotEngine {
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private tickRunning = false;

  constructor(
    private db: AppDb,
    private signalEngine: SignalEngine,
  ) {}

  start(): void {
    this.tick();
    this.tickTimer = setInterval(() => this.tick(), config.bots.tickMs);
    logger.info("[bots] engine started");
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
  }

  private tick(): void {
    if (this.tickRunning) return;
    this.tickRunning = true;
    try {
      this.checkStops();

      const bots = this.db.select().from(botsTable).all();
      const now = Date.now();
      for (const bot of bots) {
        if (!bot.enabled) continue;
        const elapsedMs = bot.lastRunAt ? now - bot.lastRunAt.getTime() : Infinity;
        if (elapsedMs < bot.pollIntervalSeconds * 1000) continue;

        try {
          this.runBot(bot.id, bot.strategy as StrategyName, JSON.parse(bot.config) as BotConfig);
        } catch (err) {
          logger.error({ err, botId: bot.id }, "[bots] tick failed for bot");
        }

        this.db
          .update(botsTable)
          .set({ lastRunAt: new Date(now), updatedAt: new Date(now) })
          .where(eq(botsTable.id, bot.id))
          .run();
      }
    } finally {
      this.tickRunning = false;
    }
  }

  private runBot(botId: string, strategy: StrategyName, botConfig: BotConfig): void {
    const account = this.db
      .select()
      .from(paperAccountTable)
      .where(eq(paperAccountTable.id, SINGLETON_ACCOUNT_ID))
      .get();
    if (!account) return;

    if (!passesDrawdownGate(botConfig.maxDrawdownPct, account.peakBalance, account.balance)) {
      logger.info({ botId }, "[bots] drawdown gate blocked new entries");
      return;
    }

    const openPositions = this.db
      .select()
      .from(paperPositionsTable)
      .where(and(eq(paperPositionsTable.botId, botId), eq(paperPositionsTable.status, "open")))
      .all();

    const slotsLeft = botConfig.maxPositions - openPositions.length;
    if (slotsLeft <= 0) return;

    const heldCoins = new Set(openPositions.map((p) => p.coin));
    const signals = this.signalEngine.getLatestSignals();
    const intents = evaluateStrategy(strategy, signals)(botConfig, heldCoins);

    let opened = 0;
    for (const intent of intents) {
      if (opened >= slotsLeft) break;

      const fresh = this.db
        .select()
        .from(paperAccountTable)
        .where(eq(paperAccountTable.id, SINGLETON_ACCOUNT_ID))
        .get();
      if (!fresh || fresh.balance < botConfig.positionSizeUsd) break;

      const quantity = botConfig.positionSizeUsd / intent.entryPrice;
      const stopLoss = stopLossPrice(intent.side, intent.entryPrice, botConfig.stopLossPct);
      const takeProfit = takeProfitPrice(intent.side, intent.entryPrice, botConfig.takeProfitPct);
      const positionId = randomUUID();

      this.db.transaction((tx) => {
        const updated = tx
          .update(paperAccountTable)
          .set({ balance: fresh.balance - botConfig.positionSizeUsd, updatedAt: new Date() })
          .where(and(eq(paperAccountTable.id, SINGLETON_ACCOUNT_ID)))
          .run();
        if (updated.changes === 0) return;

        tx.insert(paperPositionsTable)
          .values({
            id: positionId,
            botId,
            coin: intent.coin,
            side: intent.side,
            quantity,
            entryPrice: intent.entryPrice,
            stopLoss,
            takeProfit,
            signalId: intent.signalId,
            status: "open",
          })
          .run();
      });

      opened++;
      heldCoins.add(intent.coin);
      logger.info(
        { botId, coin: intent.coin, side: intent.side, entryPrice: intent.entryPrice },
        "[bots] opened paper position",
      );
    }
  }

  private checkStops(): void {
    const openPositions = this.db
      .select()
      .from(paperPositionsTable)
      .where(eq(paperPositionsTable.status, "open"))
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

      this.closePosition(pos, currentPrice, closeReason);
    }
  }

  private closePosition(
    pos: typeof paperPositionsTable.$inferSelect,
    exitPrice: number,
    closeReason: "stop_loss" | "take_profit" | "manual",
  ): void {
    const { pnl, pnlPct } = computePnl(pos.side as "long" | "short", pos.quantity, pos.entryPrice, exitPrice);
    const margin = pos.entryPrice * pos.quantity;
    const now = new Date();

    this.db.transaction((tx) => {
      const closed = tx
        .update(paperPositionsTable)
        .set({ status: closeReason === "stop_loss" ? "stopped" : "closed", pnl, pnlPct, closedPrice: exitPrice, closedAt: now })
        .where(and(eq(paperPositionsTable.id, pos.id), eq(paperPositionsTable.status, "open")))
        .run();
      if (closed.changes === 0) return; // already closed elsewhere (e.g. manual close)

      tx.insert(paperTradesTable)
        .values({
          id: randomUUID(),
          botId: pos.botId,
          positionId: pos.id,
          coin: pos.coin,
          side: pos.side,
          quantity: pos.quantity,
          entryPrice: pos.entryPrice,
          exitPrice,
          closeReason,
          pnl,
          pnlPct,
          openedAt: pos.openedAt,
          closedAt: now,
        })
        .run();

      const account = tx
        .select()
        .from(paperAccountTable)
        .where(eq(paperAccountTable.id, SINGLETON_ACCOUNT_ID))
        .get();
      if (!account) return;

      const newBalance = Math.round((account.balance + margin + pnl) * 100) / 100;
      tx.update(paperAccountTable)
        .set({
          balance: newBalance,
          peakBalance: Math.max(account.peakBalance, newBalance),
          tradeCount: account.tradeCount + 1,
          consecutiveLosses: pnl < 0 ? account.consecutiveLosses + 1 : 0,
          updatedAt: now,
        })
        .where(eq(paperAccountTable.id, SINGLETON_ACCOUNT_ID))
        .run();
    });

    logger.info({ positionId: pos.id, coin: pos.coin, closeReason, pnl }, "[bots] closed paper position");
  }

  /** Manual close, used by the API route. Returns false if the position was
   * already closed by the time this runs (e.g. a stop fired concurrently).
   */
  closePositionManually(positionId: string): boolean {
    const pos = this.db
      .select()
      .from(paperPositionsTable)
      .where(and(eq(paperPositionsTable.id, positionId), eq(paperPositionsTable.status, "open")))
      .get();
    if (!pos) return false;

    const currentPrice = this.signalEngine.getPriceForCoin(pos.coin) ?? pos.entryPrice;
    this.closePosition(pos, currentPrice, "manual");
    return true;
  }
}
