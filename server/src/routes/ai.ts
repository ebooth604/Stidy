import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { AiNotConfiguredError, AiResponseParseError, type ChatTurn } from "../ai/client.js";
import { chatWithAssistant } from "../ai/chat.js";
import { generateMarketDigest, getOrRefreshDigest } from "../ai/digest.js";
import { designBot, suggestBotTuning } from "../ai/tuner.js";
import type { AppDb } from "../db/client.js";
import { logger } from "../lib/logger.js";
import type { SignalEngine } from "../signals/engine.js";

const ChatRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) }))
    .min(1)
    .max(40),
});

const DesignRequestSchema = z.object({
  riskAppetite: z.enum(["low", "medium", "high"]),
  capitalUsd: z.number().positive().max(10_000_000),
});

async function guarded(res: Response, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      res.status(503).json({ error: err.message });
      return;
    }
    if (err instanceof AiResponseParseError) {
      logger.error({ err, raw: err.raw }, "[ai] response parse failure");
      res.status(502).json({ error: "AI returned an unexpected response shape", detail: err.message });
      return;
    }
    logger.error({ err }, "[ai] route failed");
    res.status(500).json({ error: "AI request failed" });
  }
}

export function createAiRouter(db: AppDb, signalEngine: SignalEngine): IRouter {
  const router = Router();

  router.get("/ai/digest", (_req, res) => {
    void guarded(res, async () => {
      const result = await getOrRefreshDigest(db, signalEngine);
      res.json(result);
    });
  });

  router.post("/ai/digest/refresh", (_req, res) => {
    void guarded(res, async () => {
      const result = await generateMarketDigest(db, signalEngine);
      res.json(result);
    });
  });

  router.post("/ai/bots/:id/tune", (req: Request, res: Response) => {
    void guarded(res, async () => {
      const result = await suggestBotTuning(db, req.params.id);
      res.json(result);
    });
  });

  router.post("/ai/bots/design", (req: Request, res: Response) => {
    void guarded(res, async () => {
      const parsed = DesignRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const design = await designBot(db, signalEngine, parsed.data);
      res.json(design);
    });
  });

  router.post("/ai/chat", (req: Request, res: Response) => {
    void guarded(res, async () => {
      const parsed = ChatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const reply = await chatWithAssistant(db, signalEngine, parsed.data.messages as ChatTurn[]);
      res.json({ reply });
    });
  });

  return router;
}
