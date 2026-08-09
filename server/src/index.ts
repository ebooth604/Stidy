import { createApp } from "./app.js";
import { BotEngine } from "./bots/engine.js";
import { LiveTradingEngine } from "./bots/liveEngine.js";
import { createDb } from "./db/client.js";
import { getLiveExchange, isLiveTradingConfigured, type LiveExchange } from "./hyperliquid/liveExchange.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { SignalEngine } from "./signals/engine.js";

const { db, sqlite } = createDb();

const signalEngine = new SignalEngine(db);
const botEngine = new BotEngine(db, signalEngine);

let liveExchange: LiveExchange | null = null;
if (isLiveTradingConfigured()) {
  try {
    liveExchange = getLiveExchange();
  } catch (err) {
    logger.error({ err }, "[live] failed to initialize live exchange client — live trading disabled");
  }
}
const liveEngine = new LiveTradingEngine(db, signalEngine, liveExchange);

signalEngine.start();
botEngine.start();
liveEngine.start();

const app = createApp({ db, signalEngine, botEngine, liveEngine, liveExchange });
const server = app.listen(config.server.port, () => {
  logger.info({ port: config.server.port }, "[server] listening");
});

function shutdown(): void {
  logger.info("[server] shutting down");
  server.close();
  signalEngine.stop();
  botEngine.stop();
  liveEngine.stop();
  sqlite.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
