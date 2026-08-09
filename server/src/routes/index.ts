import { Router, type IRouter } from "express";
import type { BotEngine } from "../bots/engine.js";
import type { LiveTradingEngine } from "../bots/liveEngine.js";
import type { AppDb } from "../db/client.js";
import type { LiveExchange } from "../hyperliquid/liveExchange.js";
import type { SignalEngine } from "../signals/engine.js";
import { createAiRouter } from "./ai.js";
import { createBotsRouter } from "./bots.js";
import { createHealthRouter } from "./health.js";
import { createLiveRouter } from "./live.js";
import { createPortfolioRouter } from "./portfolio.js";
import { createSignalsRouter } from "./signals.js";

export interface AppDeps {
  db: AppDb;
  signalEngine: SignalEngine;
  botEngine: BotEngine;
  liveEngine: LiveTradingEngine;
  liveExchange: LiveExchange | null;
}

export function createApiRouter(deps: AppDeps): IRouter {
  const router = Router();
  router.use(createHealthRouter());
  router.use(createSignalsRouter(deps.signalEngine));
  router.use(createBotsRouter(deps.db, deps.botEngine));
  router.use(createPortfolioRouter(deps.db));
  router.use(createAiRouter(deps.db, deps.signalEngine));
  router.use(createLiveRouter(deps.db, deps.liveEngine, deps.liveExchange));
  return router;
}
