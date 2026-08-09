import { createApp } from "./app.js";
import { BotEngine } from "./bots/engine.js";
import { createDb } from "./db/client.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { SignalEngine } from "./signals/engine.js";

const { db, sqlite } = createDb();

const signalEngine = new SignalEngine(db);
const botEngine = new BotEngine(db, signalEngine);

signalEngine.start();
botEngine.start();

const app = createApp({ db, signalEngine, botEngine });
const server = app.listen(config.server.port, () => {
  logger.info({ port: config.server.port }, "[server] listening");
});

function shutdown(): void {
  logger.info("[server] shutting down");
  server.close();
  signalEngine.stop();
  botEngine.stop();
  sqlite.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
