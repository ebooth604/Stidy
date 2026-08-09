import type { AppDb } from "../db/client.js";
import { logger } from "../lib/logger.js";
import type { SignalEngine } from "../signals/engine.js";
import { type ChatTurn, completeChat } from "./client.js";
import { buildContextSnapshot } from "./context.js";

const SYSTEM_PROMPT_PREFIX = `You are the assistant embedded in a Hyperliquid signal-analysis and paper-trading dashboard. All positions are simulated (paper trading) — no real funds are at risk, so you can speak plainly and specifically. Answer questions about the live data snapshot below, the user's bots, and general reasoning about Hyperliquid market structure (funding, basis, whale flow). Do not phrase anything as financial advice for real-money trading; frame it as analysis of the simulated system. If asked about something not covered by the snapshot, say so rather than guessing at numbers.

Current live snapshot:
`;

const MAX_TURNS_KEPT = 20;

export async function chatWithAssistant(
  db: AppDb,
  signalEngine: SignalEngine,
  history: ChatTurn[],
): Promise<string> {
  const snapshot = buildContextSnapshot(db, signalEngine);
  const system = SYSTEM_PROMPT_PREFIX + snapshot;

  const trimmed = history.slice(-MAX_TURNS_KEPT);
  const reply = await completeChat(system, trimmed, 1200);

  logger.info({ turns: trimmed.length }, "[ai] chat response generated");
  return reply;
}
