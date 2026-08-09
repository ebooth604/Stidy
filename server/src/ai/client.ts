import Anthropic from "@anthropic-ai/sdk";
import { config } from "../lib/config.js";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set — AI features are disabled until it is configured.");
    this.name = "AiNotConfiguredError";
  }
}

export class AiResponseParseError extends Error {
  constructor(raw: string, cause: unknown) {
    super(`Claude response did not match the expected shape: ${String(cause)}`);
    this.name = "AiResponseParseError";
    this.raw = raw;
  }
  raw: string;
}

let cachedClient: Anthropic | null = null;

export function isAiConfigured(): boolean {
  return Boolean(config.ai.apiKey);
}

function getClient(): Anthropic {
  if (!config.ai.apiKey) throw new AiNotConfiguredError();
  if (!cachedClient) cachedClient = new Anthropic({ apiKey: config.ai.apiKey });
  return cachedClient;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Single-turn completion: system prompt + one user message → text. */
export async function completeText(system: string, userMessage: string, maxTokens = 1500): Promise<string> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: config.ai.model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userMessage }],
  });
  const block = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  return block?.text ?? "";
}

/** Multi-turn completion for the chat assistant. */
export async function completeChat(system: string, turns: ChatTurn[], maxTokens = 1200): Promise<string> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: config.ai.model,
    max_tokens: maxTokens,
    system,
    messages: turns.map((t) => ({ role: t.role, content: t.content })),
  });
  const block = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  return block?.text ?? "";
}

/** Claude is instructed to reply with raw JSON; this strips accidental code
 * fences and validates against `schema`, surfacing a typed error on mismatch
 * rather than letting a malformed response silently propagate.
 */
export function parseJsonResponse<T>(raw: string, schema: { parse: (v: unknown) => T }): T {
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    return schema.parse(parsed);
  } catch (err) {
    throw new AiResponseParseError(raw, err);
  }
}
