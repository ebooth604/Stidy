import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { AppDb } from "../db/client.js";
import { aiReportsTable } from "../db/schema.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type { SignalEngine } from "../signals/engine.js";
import { completeText, parseJsonResponse } from "./client.js";
import { buildContextSnapshot } from "./context.js";
import { DigestSchema, type Digest } from "./schemas.js";

const SYSTEM_PROMPT = `You are a market analyst summarizing live Hyperliquid perpetual-futures data for a paper-trading dashboard. You are NOT a financial advisor and must never phrase output as investment advice — frame everything as "signal analysis" (what the data shows, not what to do with real money).

You will be given a snapshot of:
- basis gaps (perp mark price vs Hyperliquid's own oracle price — a proxy for local positioning pressure)
- funding rate extremes (annualized cost of staying in the crowded side of a trade)
- whale trade flow (large recent prints and net buy/sell imbalance)
- the current paper-trading bots and their performance

Pick the 3-8 most interesting/actionable items across ALL signal types (don't just take the single largest basis gap — a moderate gap plus aligned whale flow is more interesting than an isolated outlier). Respond with ONLY raw JSON (no markdown fences, no commentary) matching exactly this TypeScript type:

{
  "summary": string,          // 2-4 sentence plain-English overview of what's happening right now
  "items": Array<{
    "coin": string,
    "signalType": "basis" | "funding" | "whale_trade" | "combined",
    "bias": "long" | "short" | "neutral",
    "confidence": "low" | "medium" | "high",
    "rationale": string        // 1-2 sentences, cite the actual numbers from the snapshot
  }>
}`;

export interface StoredDigest {
  digest: Digest;
  generatedAt: number;
}

export async function generateMarketDigest(db: AppDb, signalEngine: SignalEngine): Promise<StoredDigest> {
  const snapshot = buildContextSnapshot(db, signalEngine);
  const raw = await completeText(SYSTEM_PROMPT, snapshot, 2000);
  const digest = parseJsonResponse(raw, DigestSchema);

  const generatedAt = Date.now();
  db.insert(aiReportsTable)
    .values({
      id: randomUUID(),
      type: "digest",
      content: JSON.stringify(digest),
      createdAt: new Date(generatedAt),
    })
    .run();

  logger.info({ items: digest.items.length }, "[ai] generated market digest");
  return { digest, generatedAt };
}

/** Returns the cached digest if it's fresher than AI_DIGEST_INTERVAL_MINUTES,
 * otherwise generates a new one. Keeps digest generation off the hot path of
 * every page load while still self-healing after the interval.
 */
export async function getOrRefreshDigest(db: AppDb, signalEngine: SignalEngine): Promise<StoredDigest> {
  const latest = db
    .select()
    .from(aiReportsTable)
    .where(eq(aiReportsTable.type, "digest"))
    .orderBy(desc(aiReportsTable.createdAt))
    .limit(1)
    .get();

  const maxAgeMs = config.ai.digestIntervalMinutes * 60_000;
  if (latest && Date.now() - latest.createdAt.getTime() < maxAgeMs) {
    return { digest: DigestSchema.parse(JSON.parse(latest.content)), generatedAt: latest.createdAt.getTime() };
  }

  return generateMarketDigest(db, signalEngine);
}
