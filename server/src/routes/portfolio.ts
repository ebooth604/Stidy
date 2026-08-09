import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { SINGLETON_ACCOUNT_ID, type AppDb } from "../db/client.js";
import { botsTable, paperAccountTable, paperPositionsTable, paperTradesTable } from "../db/schema.js";
import { currentDrawdownPct } from "../bots/riskManager.js";

export function createPortfolioRouter(db: AppDb): IRouter {
  const router = Router();

  router.get("/portfolio", (_req, res) => {
    const account = db
      .select()
      .from(paperAccountTable)
      .where(eq(paperAccountTable.id, SINGLETON_ACCOUNT_ID))
      .get();
    if (!account) {
      res.status(500).json({ error: "Paper account not initialized" });
      return;
    }

    const bots = new Map(db.select().from(botsTable).all().map((b) => [b.id, b.name]));
    const openPositions = db
      .select()
      .from(paperPositionsTable)
      .where(eq(paperPositionsTable.status, "open"))
      .all()
      .map((p) => ({ ...p, botName: bots.get(p.botId) ?? "unknown" }));

    res.json({
      account,
      drawdownPct: Math.round(currentDrawdownPct(account.peakBalance, account.balance) * 100) / 100,
      openPositions,
    });
  });

  router.get("/trades", (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const bots = new Map(db.select().from(botsTable).all().map((b) => [b.id, b.name]));
    const trades = db
      .select()
      .from(paperTradesTable)
      .orderBy(desc(paperTradesTable.closedAt))
      .limit(limit)
      .all()
      .map((t) => ({ ...t, botName: bots.get(t.botId) ?? "unknown" }));

    res.json(trades);
  });

  return router;
}
