import "dotenv/config";

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  hyperliquid: {
    apiUrl: process.env.HYPERLIQUID_API_URL ?? "https://api.hyperliquid.xyz",
    wsUrl: process.env.HYPERLIQUID_WS_URL ?? "wss://api.hyperliquid.xyz/ws",
  },
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
    digestIntervalMinutes: num("AI_DIGEST_INTERVAL_MINUTES", 20),
  },
  cmc: {
    apiKey: process.env.CMC_API_KEY ?? "",
    baseUrl: process.env.CMC_API_URL ?? "https://pro-api.coinmarketcap.com",
    // CMC's free tier recommends a 30s+ poll TTL — enforced as a floor below, not just a default.
    pollIntervalMs: Math.max(30_000, num("CMC_POLL_INTERVAL_MS", 30_000)),
    watchlistSize: num("CMC_WATCHLIST_SIZE", 15),
    basisGapAlertPct: num("CMC_BASIS_GAP_ALERT_PCT", 0.25),
  },
  db: {
    path: process.env.DATABASE_PATH ?? "./data/stidy.db",
  },
  server: {
    port: num("PORT", 8787),
    corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
  signals: {
    pollIntervalMs: num("SIGNAL_POLL_INTERVAL_MS", 15_000),
    basisGapAlertPct: num("BASIS_GAP_ALERT_PCT", 0.15),
    fundingAprAlertPct: num("FUNDING_APR_ALERT_PCT", 30),
    whaleTradeUsd: num("WHALE_TRADE_USD", 250_000),
  },
  bots: {
    tickMs: num("BOT_TICK_MS", 15_000),
  },
} as const;
