import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Latest + historical signal readings, written by the signal engine on every poll. */
export const signalsTable = sqliteTable("signals", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // "basis" | "funding" | "whale_trade"
  coin: text("coin").notNull(),
  value: real("value").notNull(), // gap % / funding APR % / trade notional USD
  direction: text("direction").notNull(), // "long" | "short" | "neutral"
  context: text("context").notNull(), // JSON blob of the raw numbers behind `value`
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** A configured bot: one strategy instance with its own risk settings. */
export const botsTable = sqliteTable("bots", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  strategy: text("strategy").notNull(), // "basis_reversion" | "funding_reversion"
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  config: text("config").notNull(), // JSON: BotConfig
  pollIntervalSeconds: integer("poll_interval_seconds").notNull().default(60),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Single-row-per-app paper account (single-user app: one shared balance). */
export const paperAccountTable = sqliteTable("paper_account", {
  id: text("id").primaryKey(),
  balance: real("balance").notNull().default(100_000),
  peakBalance: real("peak_balance").notNull().default(100_000),
  tradeCount: integer("trade_count").notNull().default(0),
  consecutiveLosses: integer("consecutive_losses").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const paperPositionsTable = sqliteTable("paper_positions", {
  id: text("id").primaryKey(),
  botId: text("bot_id").notNull(),
  coin: text("coin").notNull(),
  side: text("side").notNull(), // "long" | "short"
  quantity: real("quantity").notNull(),
  entryPrice: real("entry_price").notNull(),
  stopLoss: real("stop_loss").notNull(),
  takeProfit: real("take_profit").notNull(),
  signalId: text("signal_id"),
  status: text("status").notNull().default("open"), // "open" | "closed" | "stopped"
  pnl: real("pnl"),
  pnlPct: real("pnl_pct"),
  closedPrice: real("closed_price"),
  openedAt: integer("opened_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  closedAt: integer("closed_at", { mode: "timestamp" }),
});

export const paperTradesTable = sqliteTable("paper_trades", {
  id: text("id").primaryKey(),
  botId: text("bot_id").notNull(),
  positionId: text("position_id").notNull(),
  coin: text("coin").notNull(),
  side: text("side").notNull(),
  quantity: real("quantity").notNull(),
  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price").notNull(),
  closeReason: text("close_reason").notNull(), // "stop_loss" | "take_profit" | "manual"
  pnl: real("pnl").notNull(),
  pnlPct: real("pnl_pct").notNull(),
  signalValueAtEntry: real("signal_value_at_entry"),
  openedAt: integer("opened_at", { mode: "timestamp" }).notNull(),
  closedAt: integer("closed_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Cached AI output: digests, tuning suggestions, bot designs. */
export const aiReportsTable = sqliteTable("ai_reports", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // "digest" | "tuning" | "design"
  botId: text("bot_id"),
  content: text("content").notNull(), // JSON blob, shape depends on `type`
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
