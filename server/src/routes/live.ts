import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import type { LiveTradingEngine } from "../bots/liveEngine.js";
import type { AppDb } from "../db/client.js";
import { botsTable, livePositionsTable, liveTradesTable } from "../db/schema.js";
import { isLiveTradingConfigured } from "../hyperliquid/liveExchange.js";
import { logger } from "../lib/logger.js";
import type { LiveExchange } from "../hyperliquid/liveExchange.js";

export function createLiveRouter(db: AppDb, liveEngine: LiveTradingEngine, exchange: LiveExchange | null): IRouter {
  const router = Router();

  router.get("/live/account", (_req, res) => {
    void (async () => {
      if (!isLiveTradingConfigured() || !exchange) {
        res.status(503).json({ error: "Live trading is not configured on this server" });
        return;
      }
      try {
        res.json(await exchange.getAccountState());
      } catch (err) {
        logger.error({ err }, "[live] failed to fetch account state");
        res.status(502).json({ error: "Failed to fetch live account state from Hyperliquid" });
      }
    })();
  });

  router.get("/live/positions", (_req, res) => {
    const bots = new Map(db.select().from(botsTable).all().map((b) => [b.id, b.name]));
    const positions = db
      .select()
      .from(livePositionsTable)
      .where(eq(livePositionsTable.status, "open"))
      .all()
      .map((p) => ({ ...p, botName: bots.get(p.botId) ?? "unknown" }));
    res.json(positions);
  });

  router.get("/live/trades", (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const bots = new Map(db.select().from(botsTable).all().map((b) => [b.id, b.name]));
    const trades = db
      .select()
      .from(liveTradesTable)
      .orderBy(desc(liveTradesTable.closedAt))
      .limit(limit)
      .all()
      .map((t) => ({ ...t, botName: bots.get(t.botId) ?? "unknown" }));
    res.json(trades);
  });

  router.post("/live-positions/:id/close", (req, res) => {
    void (async () => {
      const closed = await liveEngine.closePositionManually(req.params.id);
      if (!closed) {
        res.status(409).json({ error: "Position already closed, not found, or the close order failed — check server logs" });
        return;
      }
      res.json({ closed: true });
    })();
  });

  return router;
}
