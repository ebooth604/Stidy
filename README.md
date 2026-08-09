# Stidy

A Hyperliquid signal-analysis and paper-trading platform: it reads live public
market data from [Hyperliquid](https://hyperliquid.xyz), turns it into
trading signals, runs configurable **paper-trading** bots against those
signals, and layers Claude on top for a market digest, bot tuning
suggestions, "design a bot for me," and a chat assistant.

**No real funds are ever at risk.** Every position is simulated against live
prices — there is no wallet integration, no order signing, no live-trading
path. That was a deliberate scope decision, not a missing feature.

Inspired by [bitcompare](https://github.com/mydogsophie2-create/bitcompare),
which does the same "futures price vs a reference price → paper trade the
gap" idea against AsterDex/Paradex on Replit's stack (Clerk auth, Postgres,
Expo mobile app). Stidy re-targets Hyperliquid and drops the Replit-specific
plumbing (no Clerk, no Postgres, no mobile app) in favor of a
self-hostable, zero-external-infra Node/TS + SQLite stack — single-user by
design, since that's what this app is for right now.

## Architecture

```
server/   Express API + signal engine + bot engine (Node 20+, TypeScript, ESM)
web/      React dashboard (Vite + Tailwind)
```

### Signals (`server/src/signals`)

Computed from Hyperliquid's public `/info` REST endpoint and WS feed — no
API key or wallet needed:

- **basis** — perp mark price vs Hyperliquid's own oracle price. A gap means
  local positioning pressure that tends to mean-revert.
- **funding** — annualized funding rate. Extreme funding means one side of
  the market is paying heavily to stay positioned (a fade/reversion setup).
- **whale_trade** — large individual prints from the live trades WS feed,
  plus a rolling 15-minute buy/sell notional imbalance per coin.
- **cmc_basis** *(optional)* — Hyperliquid mark price vs CoinMarketCap's
  aggregated spot price, i.e. a cross-check against the broader market
  rather than Hyperliquid's own oracle. Only active if `CMC_API_KEY` is set;
  otherwise this signal type simply never fires and the feature is invisible
  in the UI beyond a "not configured" note. **Never commit a real CMC key —
  it's read from an environment variable only.**

Every fired signal is persisted to SQLite for history, and held in memory
for fast reads by the API and bot engine.

### Bots (`server/src/bots`)

Each bot picks one strategy and a set of risk knobs (`minSignalValue`,
`stopLossPct`, `takeProfitPct`, `positionSizeUsd`, `maxPositions`,
`maxDrawdownPct`). A single tick loop (`BotEngine`, every `BOT_TICK_MS`):

1. Checks stop-loss/take-profit on **every** open position, for **every**
   bot, every tick — regardless of whether the bot is enabled.
2. For enabled bots whose poll interval has elapsed, evaluates the
   strategy against current signals and opens new paper positions (subject
   to `maxPositions` and the drawdown circuit breaker).

Strategies: `basis_reversion`, `funding_reversion`, `cmc_basis_reversion`
(all in `server/src/bots/strategies`, each a small pure function over the
matching signal list — trivial to add a new one).

All state changes (open, close, balance update) are single synchronous
better-sqlite3 transactions, so there's no cross-process race to guard
against the way a Postgres-backed multi-instance setup would need.

### AI (`server/src/ai`)

Uses the Anthropic API (`ANTHROPIC_API_KEY`, model configurable via
`ANTHROPIC_MODEL`, defaults to `claude-sonnet-5`). Every route degrades to a
clear 503 if the key isn't set — nothing fails silently or falls back to
canned output.

- **Market digest** (`GET/POST /api/ai/digest`) — periodic, cached summary
  of the most interesting current signals across all types, in plain
  English. Regenerates automatically after `AI_DIGEST_INTERVAL_MINUTES`.
- **Bot tuning** (`POST /api/ai/bots/:id/tune`) — reviews a bot's actual
  closed-trade stats (win rate, avg win/loss, stop-vs-target close ratio)
  and proposes a specific config change with rationale. Never auto-applied —
  the UI shows it and you click "Apply."
- **Design a bot** (`POST /api/ai/bots/design`) — given a risk appetite and
  capital amount, picks a strategy and sizes a full config against the
  *current* live signal snapshot.
- **Chat** (`POST /api/ai/chat`) — a plain conversational endpoint; the
  server injects a fresh live-data snapshot as system context on every call
  (no tool-use loop yet — a natural next step if you want the assistant to
  pull data on demand instead of what's pre-injected).

All structured AI output is validated with `zod` against an explicit schema
(`server/src/ai/schemas.ts`); a malformed response surfaces as a typed
`AiResponseParseError` (502) rather than silently propagating bad data.

## Running it

Requires Node 20+.

```bash
npm install
cp server/.env.example server/.env   # fill in what you want to enable
npm run dev:server   # http://localhost:8787
npm run dev:web      # http://localhost:5173 (proxies /api to the server)
```

Nothing beyond `npm install` is required to get a working app — SQLite is
file-based and self-initializes at `server/data/stidy.db` on first run.
`ANTHROPIC_API_KEY` and `CMC_API_KEY` are both optional; everything else
(signals, paper trading) works without them.

### Environment variables

See `server/.env.example` for the full list with defaults. The only ones
you're likely to change:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables `/api/ai/*` (digest, tuning, chat, bot design) |
| `CMC_API_KEY` | Enables the `cmc_basis` signal + `cmc_basis_reversion` strategy |
| `HYPERLIQUID_API_URL` / `HYPERLIQUID_WS_URL` | Point at testnet instead of mainnet |
| `BASIS_GAP_ALERT_PCT`, `FUNDING_APR_ALERT_PCT`, `WHALE_TRADE_USD` | Signal-firing thresholds |

### Tests

```bash
cd server && npm test
```

54 tests covering signal math, risk management, strategy selection, the
full bot lifecycle (open → stop-loss/take-profit → close, including the
drawdown gate), the Hyperliquid/CMC REST clients (mocked `fetch`), and the
AI response parser — all pure-function or in-memory-SQLite tests, no live
network required.

## What's deliberately not here

- **No live trading.** Adding it would mean Hyperliquid API-wallet signing
  and real funds — a substantial, separate piece of work with real
  consequences if it has a bug. Paper trading against live prices proves
  out a strategy's logic first.
- **No multi-user auth.** Single shared paper account by design.
- **No mobile app.** bitcompare has one (Expo/React Native); this is
  web-only for now.
