import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { config } from "../lib/config.js";
import * as schema from "./schema.js";

/** Single source of truth for table DDL. Inlined (rather than a .sql asset file)
 * so it survives the tsc build without a separate copy step.
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  coin TEXT NOT NULL,
  value REAL NOT NULL,
  direction TEXT NOT NULL,
  context TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_signals_type_coin_created ON signals (type, coin, created_at);
CREATE INDEX IF NOT EXISTS idx_signals_created ON signals (created_at);

CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  strategy TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  config TEXT NOT NULL,
  poll_interval_seconds INTEGER NOT NULL DEFAULT 60,
  last_run_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS paper_account (
  id TEXT PRIMARY KEY,
  balance REAL NOT NULL DEFAULT 100000,
  peak_balance REAL NOT NULL DEFAULT 100000,
  trade_count INTEGER NOT NULL DEFAULT 0,
  consecutive_losses INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS paper_positions (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  coin TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity REAL NOT NULL,
  entry_price REAL NOT NULL,
  stop_loss REAL NOT NULL,
  take_profit REAL NOT NULL,
  signal_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  pnl REAL,
  pnl_pct REAL,
  closed_price REAL,
  opened_at INTEGER NOT NULL DEFAULT (unixepoch()),
  closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_positions_bot_status ON paper_positions (bot_id, status);
CREATE INDEX IF NOT EXISTS idx_positions_status_coin ON paper_positions (status, coin);

CREATE TABLE IF NOT EXISTS paper_trades (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  position_id TEXT NOT NULL,
  coin TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity REAL NOT NULL,
  entry_price REAL NOT NULL,
  exit_price REAL NOT NULL,
  close_reason TEXT NOT NULL,
  pnl REAL NOT NULL,
  pnl_pct REAL NOT NULL,
  signal_value_at_entry REAL,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_trades_bot ON paper_trades (bot_id);
CREATE INDEX IF NOT EXISTS idx_trades_closed_at ON paper_trades (closed_at);

CREATE TABLE IF NOT EXISTS live_positions (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  coin TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity REAL NOT NULL,
  entry_price REAL NOT NULL,
  stop_loss REAL NOT NULL,
  take_profit REAL NOT NULL,
  signal_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  pnl REAL,
  pnl_pct REAL,
  closed_price REAL,
  opened_at INTEGER NOT NULL DEFAULT (unixepoch()),
  closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_live_positions_bot_status ON live_positions (bot_id, status);
CREATE INDEX IF NOT EXISTS idx_live_positions_status_coin ON live_positions (status, coin);

CREATE TABLE IF NOT EXISTS live_trades (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  position_id TEXT NOT NULL,
  coin TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity REAL NOT NULL,
  entry_price REAL NOT NULL,
  exit_price REAL NOT NULL,
  close_reason TEXT NOT NULL,
  pnl REAL NOT NULL,
  pnl_pct REAL NOT NULL,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_live_trades_bot ON live_trades (bot_id);
CREATE INDEX IF NOT EXISTS idx_live_trades_closed_at ON live_trades (closed_at);

CREATE TABLE IF NOT EXISTS ai_reports (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  bot_id TEXT,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_ai_reports_type_created ON ai_reports (type, created_at);
`;

export const SINGLETON_ACCOUNT_ID = "main";
const STARTING_BALANCE = 100_000;

function openDatabase(path: string) {
  if (path !== ":memory:") {
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(SCHEMA_SQL);
  return sqlite;
}

export function createDb(path: string = config.db.path) {
  const sqlite = openDatabase(path);
  const db = drizzle(sqlite, { schema });

  const existing = sqlite
    .prepare("SELECT id FROM paper_account WHERE id = ?")
    .get(SINGLETON_ACCOUNT_ID);
  if (!existing) {
    sqlite
      .prepare(
        "INSERT INTO paper_account (id, balance, peak_balance) VALUES (?, ?, ?)",
      )
      .run(SINGLETON_ACCOUNT_ID, STARTING_BALANCE, STARTING_BALANCE);
  }

  return { db, sqlite };
}

export type AppDb = ReturnType<typeof createDb>["db"];
