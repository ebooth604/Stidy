import "dotenv/config";

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === "true" || raw === "1";
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
  // Real-money trading. Every field here is OFF/empty by default — a bot never
  // places a live order unless `enabled` is explicitly true AND both the key
  // and account address are set. See server/.env.example for the full warning.
  liveTrading: {
    enabled: bool("HYPERLIQUID_LIVE_TRADING_ENABLED", false),
    // Private key for a Hyperliquid "API wallet" (agent) — NOT your main wallet's
    // key. Never logged; only ever passed to the signing library in-process.
    apiWalletPrivateKey: process.env.HYPERLIQUID_API_WALLET_PRIVATE_KEY ?? "",
    // The MASTER account address the API wallet is approved to trade on behalf
    // of (public info, not a secret) — funds and positions live here, not at
    // the API wallet's own address.
    accountAddress: process.env.HYPERLIQUID_ACCOUNT_ADDRESS ?? "",
    // Hard ceiling on any single live order's notional USD, enforced in code
    // independent of what a bot's own positionSizeUsd config says.
    maxOrderUsd: num("HYPERLIQUID_LIVE_MAX_ORDER_USD", 100),
    // Aggressive-IOC slippage tolerance in basis points used to emulate a
    // "market" order (Hyperliquid has no native market order type).
    slippageBps: num("HYPERLIQUID_LIVE_SLIPPAGE_BPS", 50),
  },
} as const;
