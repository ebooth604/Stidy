import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { BotConfigSchema } from "../ai/schemas.js";
import type { BotEngine } from "../bots/engine.js";
import { getBotSummaries } from "../bots/summary.js";
import { DEFAULT_BOT_CONFIG, STRATEGY_NAMES } from "../bots/types.js";
import type { AppDb } from "../db/client.js";
import { botsTable, paperPositionsTable, paperTradesTable } from "../db/schema.js";

const StrategyEnum = z.enum(STRATEGY_NAMES as [string, ...string[]]);

const CreateBotSchema = z.object({
  name: z.string().min(1).max(100),
  strategy: StrategyEnum,
  config: BotConfigSchema.partial().optional(),
  pollIntervalSeconds: z.number().int().min(15).max(3600).optional(),
  enabled: z.boolean().optional(),
});

const UpdateBotSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  config: BotConfigSchema.partial().optional(),
  pollIntervalSeconds: z.number().int().min(15).max(3600).optional(),
  enabled: z.boolean().optional(),
});

export function createBotsRouter(db: AppDb, botEngine: BotEngine): IRouter {
  const router = Router();

  router.get("/bots", (_req, res) => {
    res.json(getBotSummaries(db));
  });

  router.post("/bots", (req, res) => {
    const parsed = CreateBotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { name, strategy, config, pollIntervalSeconds, enabled } = parsed.data;
    const id = randomUUID();
    const now = new Date();

    db.insert(botsTable)
      .values({
        id,
        name,
        strategy,
        enabled: enabled ?? false,
        config: JSON.stringify({ ...DEFAULT_BOT_CONFIG, ...config }),
        pollIntervalSeconds: pollIntervalSeconds ?? 60,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    res.status(201).json(getBotSummaries(db).find((b) => b.id === id));
  });

  router.get("/bots/:id", (req, res) => {
    const bot = getBotSummaries(db).find((b) => b.id === req.params.id);
    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }
    const openPositions = db
      .select()
      .from(paperPositionsTable)
      .where(eq(paperPositionsTable.botId, bot.id))
      .all()
      .filter((p) => p.status === "open");
    const recentTrades = db
      .select()
      .from(paperTradesTable)
      .where(eq(paperTradesTable.botId, bot.id))
      .orderBy(desc(paperTradesTable.closedAt))
      .limit(50)
      .all();

    res.json({ ...bot, openPositions, recentTrades });
  });

  router.patch("/bots/:id", (req, res) => {
    const existing = db.select().from(botsTable).where(eq(botsTable.id, req.params.id)).get();
    if (!existing) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }
    const parsed = UpdateBotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { name, config, pollIntervalSeconds, enabled } = parsed.data;
    const mergedConfig = config
      ? { ...JSON.parse(existing.config), ...config }
      : undefined;

    db.update(botsTable)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(mergedConfig ? { config: JSON.stringify(mergedConfig) } : {}),
        ...(pollIntervalSeconds !== undefined ? { pollIntervalSeconds } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
        updatedAt: new Date(),
      })
      .where(eq(botsTable.id, req.params.id))
      .run();

    res.json(getBotSummaries(db).find((b) => b.id === req.params.id));
  });

  router.delete("/bots/:id", (req, res) => {
    const openCount = db
      .select()
      .from(paperPositionsTable)
      .where(eq(paperPositionsTable.botId, req.params.id))
      .all()
      .filter((p) => p.status === "open").length;
    if (openCount > 0) {
      res.status(409).json({ error: `Bot has ${openCount} open position(s) — close them before deleting` });
      return;
    }
    db.delete(botsTable).where(eq(botsTable.id, req.params.id)).run();
    res.status(204).send();
  });

  router.post("/positions/:id/close", (req, res) => {
    const closed = botEngine.closePositionManually(req.params.id);
    if (!closed) {
      res.status(409).json({ error: "Position already closed or not found" });
      return;
    }
    res.json({ closed: true });
  });

  return router;
}
