import { Router, type IRouter } from "express";
import { isCmcConfigured } from "../external/coinmarketcap.js";
import type { SignalEngine } from "../signals/engine.js";

export function createSignalsRouter(signalEngine: SignalEngine): IRouter {
  const router = Router();

  router.get("/signals", (_req, res) => {
    const { basis, funding, whaleTrades, cmcBasis } = signalEngine.getLatestSignals();
    res.json({
      basis,
      funding,
      whaleTrades,
      cmcBasis,
      cmcConfigured: isCmcConfigured(),
      whaleImbalances: signalEngine.getWhaleImbalances(),
    });
  });

  router.get("/signals/snapshots", (_req, res) => {
    res.json(signalEngine.getSnapshots());
  });

  return router;
}
