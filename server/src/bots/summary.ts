import { and, eq } from "drizzle-orm";
import type { AppDb } from "../db/client.js";
import { botsTable, paperPositionsTable, paperTradesTable } from "../db/schema.js";
import type { BotConfig, BotSummary, StrategyName } from "./types.js";

export function getBotSummaries(db: AppDb): BotSummary[] {
  const bots = db.select().from(botsTable).all();

  return bots.map((bot) => {
    const openPositions = db
      .select()
      .from(paperPositionsTable)
      .where(and(eq(paperPositionsTable.botId, bot.id), eq(paperPositionsTable.status, "open")))
      .all();
    const trades = db.select().from(paperTradesTable).where(eq(paperTradesTable.botId, bot.id)).all();

    const totalPnl = Math.round(trades.reduce((sum, t) => sum + t.pnl, 0) * 100) / 100;
    const wins = trades.filter((t) => t.pnl > 0).length;

    return {
      id: bot.id,
      name: bot.name,
      strategy: bot.strategy as StrategyName,
      enabled: bot.enabled,
      config: JSON.parse(bot.config) as BotConfig,
      pollIntervalSeconds: bot.pollIntervalSeconds,
      lastRunAt: bot.lastRunAt ? bot.lastRunAt.getTime() : null,
      createdAt: bot.createdAt.getTime(),
      updatedAt: bot.updatedAt.getTime(),
      openPositions: openPositions.length,
      totalTrades: trades.length,
      totalPnl,
      winRate: trades.length > 0 ? Math.round((wins / trades.length) * 1000) / 10 : null,
    };
  });
}
