import { Router, type IRouter } from "express";
import { isAiConfigured } from "../ai/client.js";
import { isCmcConfigured } from "../external/coinmarketcap.js";
import { isLiveTradingConfigured } from "../hyperliquid/liveExchange.js";

export function createHealthRouter(): IRouter {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      aiConfigured: isAiConfigured(),
      cmcConfigured: isCmcConfigured(),
      liveTradingConfigured: isLiveTradingConfigured(),
      time: new Date().toISOString(),
    });
  });

  return router;
}
