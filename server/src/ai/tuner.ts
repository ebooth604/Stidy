import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { BotConfig } from "../bots/types.js";
import type { AppDb } from "../db/client.js";
import { aiReportsTable, botsTable, paperTradesTable } from "../db/schema.js";
import { logger } from "../lib/logger.js";
import type { SignalEngine } from "../signals/engine.js";
import { completeText, parseJsonResponse } from "./client.js";
import { buildContextSnapshot } from "./context.js";
import { BotDesignSchema, TuningSuggestionSchema, type BotDesign, type TuningSuggestion } from "./schemas.js";

const TUNING_SYSTEM_PROMPT = `You are a quantitative trading assistant reviewing the historical performance of ONE paper-trading bot on a Hyperliquid signal-analysis dashboard. All trades are simulated — no real money — so be direct and specific rather than hedging.

You'll be given the bot's strategy, current config, and closed-trade statistics. Propose an adjusted config that plausibly improves risk-adjusted performance given the stats (e.g. if take-profit is rarely hit before stop-loss, the ratio may be wrong; if win rate is high but avg win is small vs avg loss, tighten stops or raise the signal threshold; if very few trades fired, the entry threshold may be too strict). Respond with ONLY raw JSON (no markdown fences) matching exactly:

{
  "rationale": string,  // 2-4 sentences citing the actual stats given
  "suggestedConfig": {
    "minSignalValue": number,
    "stopLossPct": number,
    "takeProfitPct": number,
    "positionSizeUsd": number,
    "maxPositions": number,
    "maxDrawdownPct": number
  }
}`;

const DESIGN_SYSTEM_PROMPT = `You are a quantitative trading assistant designing a NEW paper-trading bot for a Hyperliquid signal-analysis dashboard. All trades are simulated — no real money is at risk, so recommend genuinely differentiated parameters rather than generic defaults.

Available strategies:
- "basis_reversion": bets that a perp's mark price reverts toward Hyperliquid's own oracle price when the gap exceeds minSignalValue (a percentage).
- "funding_reversion": fades extreme annualized funding rates (minSignalValue is an APR percentage), betting the crowded/paying side unwinds.
- "cmc_basis_reversion": bets that Hyperliquid's mark price reverts toward the broader market's spot price (CoinMarketCap aggregate, independent of Hyperliquid's own oracle) — only pick this if the snapshot shows live cmc_basis data; if the snapshot has no CoinMarketCap section, this strategy has no live signals feeding it and should not be chosen.

You'll be given the user's risk appetite, available capital, and a snapshot of current live signals. Pick ONE strategy that fits the current market environment, and size the config to the stated capital and risk appetite (higher risk appetite → larger positionSizeUsd / more maxPositions / wider stops relative to capital; lower → the opposite). Respond with ONLY raw JSON (no markdown fences) matching exactly:

{
  "name": string,
  "strategy": "basis_reversion" | "funding_reversion",
  "rationale": string,  // 2-4 sentences referencing the live snapshot and risk appetite
  "config": {
    "minSignalValue": number,
    "stopLossPct": number,
    "takeProfitPct": number,
    "positionSizeUsd": number,
    "maxPositions": number,
    "maxDrawdownPct": number
  }
}`;

export interface TradeStats {
  count: number;
  winRate: number | null;
  avgPnl: number;
  avgWin: number;
  avgLoss: number;
  stopLossCloses: number;
  takeProfitCloses: number;
  totalPnl: number;
}

function computeTradeStats(trades: { pnl: number; closeReason: string }[]): TradeStats {
  const count = trades.length;
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const totalPnl = Math.round(trades.reduce((s, t) => s + t.pnl, 0) * 100) / 100;
  return {
    count,
    winRate: count > 0 ? Math.round((wins.length / count) * 1000) / 10 : null,
    avgPnl: count > 0 ? Math.round((totalPnl / count) * 100) / 100 : 0,
    avgWin: wins.length > 0 ? Math.round((wins.reduce((s, t) => s + t.pnl, 0) / wins.length) * 100) / 100 : 0,
    avgLoss: losses.length > 0 ? Math.round((losses.reduce((s, t) => s + t.pnl, 0) / losses.length) * 100) / 100 : 0,
    stopLossCloses: trades.filter((t) => t.closeReason === "stop_loss").length,
    takeProfitCloses: trades.filter((t) => t.closeReason === "take_profit").length,
    totalPnl,
  };
}

export async function suggestBotTuning(
  db: AppDb,
  botId: string,
): Promise<{ suggestion: TuningSuggestion; stats: TradeStats }> {
  const bot = db.select().from(botsTable).where(eq(botsTable.id, botId)).get();
  if (!bot) throw new Error(`Bot ${botId} not found`);

  const trades = db
    .select()
    .from(paperTradesTable)
    .where(eq(paperTradesTable.botId, botId))
    .orderBy(desc(paperTradesTable.closedAt))
    .limit(200)
    .all();

  const stats = computeTradeStats(trades);
  const currentConfig = JSON.parse(bot.config) as BotConfig;

  const prompt = [
    `Bot: "${bot.name}"`,
    `Strategy: ${bot.strategy}`,
    `Current config: ${JSON.stringify(currentConfig)}`,
    `Closed trades analyzed: ${stats.count}`,
    `Win rate: ${stats.winRate ?? "n/a"}%`,
    `Avg P&L per trade: $${stats.avgPnl}`,
    `Avg win: $${stats.avgWin} | Avg loss: $${stats.avgLoss}`,
    `Closed via stop-loss: ${stats.stopLossCloses} | Closed via take-profit: ${stats.takeProfitCloses}`,
    `Total P&L: $${stats.totalPnl}`,
  ].join("\n");

  const raw = await completeText(TUNING_SYSTEM_PROMPT, prompt, 1200);
  const suggestion = parseJsonResponse(raw, TuningSuggestionSchema);

  db.insert(aiReportsTable)
    .values({
      id: randomUUID(),
      type: "tuning",
      botId,
      content: JSON.stringify(suggestion),
      createdAt: new Date(),
    })
    .run();

  logger.info({ botId }, "[ai] generated tuning suggestion");
  return { suggestion, stats };
}

export interface DesignBotInput {
  riskAppetite: "low" | "medium" | "high";
  capitalUsd: number;
}

export async function designBot(
  db: AppDb,
  signalEngine: SignalEngine,
  input: DesignBotInput,
): Promise<BotDesign> {
  const snapshot = buildContextSnapshot(db, signalEngine);
  const prompt = `Risk appetite: ${input.riskAppetite}\nAvailable capital: $${input.capitalUsd}\n\nLive snapshot:\n${snapshot}`;

  const raw = await completeText(DESIGN_SYSTEM_PROMPT, prompt, 1200);
  const design = parseJsonResponse(raw, BotDesignSchema);

  db.insert(aiReportsTable)
    .values({
      id: randomUUID(),
      type: "design",
      content: JSON.stringify(design),
      createdAt: new Date(),
    })
    .run();

  logger.info({ strategy: design.strategy }, "[ai] designed new bot");
  return design;
}
