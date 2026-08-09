# Stidy

A Hyperliquid signal-analysis and trading platform: it reads live public
market data from [Hyperliquid](https://hyperliquid.xyz), turns it into
trading signals, runs configurable bots against those signals, and layers
Claude on top for a market digest, bot tuning suggestions, "design a bot for
me," and a chat assistant.

**Paper trading (simulated) is the default and requires zero secrets.** Live
trading with real funds is an explicit, off-by-default opt-in — see
[Live trading](#live-trading-real-money) below before touching it.

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
`maxDrawdownPct`, `liveTrading`). A single tick loop (`BotEngine`, every
`BOT_TICK_MS`):

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

A bot with `liveTrading: true` is handled by a completely separate engine
(`LiveTradingEngine`, see below) — the paper `BotEngine` above never places a
real order under any circumstance.

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

**The AI can never turn on live trading.** The zod schema Claude's output is
validated against (`AiBotConfigSchema`) structurally has no `liveTrading`
field — not a default, not a filter, the field doesn't exist in that schema —
so a tuning suggestion or bot design can't carry it even if the model
generated it. Toggling live trading is only ever a direct, human action in
the UI (with a confirmation dialog) or API call.

## Live trading (real money)

Off by default. **Three separate things must all be true** before any bot can
place a real order — missing any one of them makes live trading fully inert:

1. `HYPERLIQUID_LIVE_TRADING_ENABLED=true` — the server-wide kill switch.
2. `HYPERLIQUID_API_WALLET_PRIVATE_KEY` — set (see setup below).
3. `HYPERLIQUID_ACCOUNT_ADDRESS` — set (see setup below).

...and even then, a bot only trades real funds if you explicitly check "Live
trading" on that specific bot (confirmed via a dialog) — every bot defaults
to paper trading.

### Setup

1. Go to [app.hyperliquid.xyz/API](https://app.hyperliquid.xyz/API) and
   approve an **API wallet** (Hyperliquid's term for what's commonly called
   an agent wallet). This generates a *new* keypair that's authorized to
   trade on behalf of your main account but **cannot withdraw funds** —
   use this key, never your main wallet's private key.
2. Set `HYPERLIQUID_API_WALLET_PRIVATE_KEY` to that new wallet's private key,
   and `HYPERLIQUID_ACCOUNT_ADDRESS` to your **main** account's address (the
   one holding the funds — not the API wallet's own address; Hyperliquid
   resolves the API wallet back to the account that approved it automatically
   for order placement, but reading your balance/positions needs the main
   address explicitly).
3. Set `HYPERLIQUID_LIVE_TRADING_ENABLED=true`.
4. Set `HYPERLIQUID_LIVE_MAX_ORDER_USD` to something small to start —
   this is a hard ceiling enforced in code on every single order
   (`server/src/hyperliquid/liveExchange.ts`), independent of whatever a
   bot's own `positionSizeUsd` says. A bot can't even be saved with
   `liveTrading: true` if its `positionSizeUsd` exceeds this cap.
5. Strongly consider testing against testnet first: set
   `HYPERLIQUID_API_URL=https://api.hyperliquid-testnet.xyz` and get testnet
   funds from Hyperliquid's testnet faucet before pointing at mainnet.

### How an order is placed

Hyperliquid has no native "market order" — `placeMarketOrder()` emulates one
as an **Immediate-or-Cancel limit order** priced `HYPERLIQUID_LIVE_SLIPPAGE_BPS`
past the reference price, so it either fills (fully or partially) immediately
or cancels outright; it never rests on the book. Price/size are rounded to
Hyperliquid's tick/lot rules via the `@nktkas/hyperliquid` SDK's
`formatPrice`/`formatSize` helpers. Recorded position size and entry price
are always the **actual fill** the exchange reports, never the pre-trade
reference price.

### Safety model

- **Separate everything.** Live positions/trades live in their own tables
  (`live_positions`, `live_trades`) and their own `LiveTradingEngine` —
  structurally incapable of touching the paper account balance or the paper
  `BotEngine`'s bookkeeping.
- **Hard cap enforced in code**, not just config: `HyperliquidLiveExchange.placeMarketOrder`
  refuses any order whose notional exceeds `HYPERLIQUID_LIVE_MAX_ORDER_USD`
  before it does anything else — no network call, no signing.
- **Real margin gate**: before opening a new live position, the engine checks
  actual `withdrawable` margin from Hyperliquid (not a synthetic balance).
- **Stops are polled, not native.** Take-profit/stop-loss are checked every
  `BOT_TICK_MS` and closed with a reduce-only order at that point — same
  mechanism as paper trading, for one consistent mental model. This means a
  stop can slip past its trigger price if the server is down or the tick
  is slow; it is **not** a guaranteed-execution native trigger order on
  Hyperliquid's book. Keep position sizes small accordingly.
- **The AI never sets `liveTrading`** (see above) and every route that would
  enable it validates server-side, not just in the UI.

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
| `HYPERLIQUID_LIVE_TRADING_ENABLED` + key + address | Enables real-money trading — see [Live trading](#live-trading-real-money) |

### Tests

```bash
cd server && npm test
```

72 tests covering signal math, risk management, strategy selection, the
full paper-bot lifecycle (open → stop-loss/take-profit → close, including
the drawdown gate), the live-trading engine and its hard order-size cap
(mocked exchange, no real signing or network), the Hyperliquid/CMC REST
clients (mocked `fetch`), and the AI response parser — all pure-function or
in-memory-SQLite tests, no live network required.

## What's deliberately not here

- **No multi-user auth.** Single shared account by design.
- **No mobile app.** bitcompare has one (Expo/React Native); this is
  web-only for now.
- **No native trigger orders for live stops** — see the safety model above.
