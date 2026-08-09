import { z } from "zod";

/** AI-facing config schema — deliberately has NO `liveTrading` field. This
 * isn't just a default; it's a structural guarantee that Claude's JSON
 * output can never turn on real-money trading, no matter what it generates.
 * The full BotConfig (with liveTrading) lives in ../bots/types.ts and is
 * validated separately for the create/update bot routes.
 */
export const AiBotConfigSchema = z.object({
  minSignalValue: z.number().positive(),
  stopLossPct: z.number().positive(),
  takeProfitPct: z.number().positive(),
  positionSizeUsd: z.number().positive(),
  maxPositions: z.number().int().positive(),
  maxDrawdownPct: z.number().min(0),
});
export type AiBotConfig = z.infer<typeof AiBotConfigSchema>;

/** Full bot config schema, including liveTrading — used to validate the
 * create/update bot API routes (user-originated requests only, never AI output).
 */
export const BotConfigSchema = AiBotConfigSchema.extend({
  liveTrading: z.boolean(),
});

export const DigestItemSchema = z.object({
  coin: z.string(),
  signalType: z.enum(["basis", "funding", "whale_trade", "cmc_basis", "combined"]),
  bias: z.enum(["long", "short", "neutral"]),
  confidence: z.enum(["low", "medium", "high"]),
  rationale: z.string(),
});

export const DigestSchema = z.object({
  summary: z.string(),
  items: z.array(DigestItemSchema).max(8),
});
export type Digest = z.infer<typeof DigestSchema>;

export const TuningSuggestionSchema = z.object({
  rationale: z.string(),
  suggestedConfig: AiBotConfigSchema,
});
export type TuningSuggestion = z.infer<typeof TuningSuggestionSchema>;

export const BotDesignSchema = z.object({
  name: z.string(),
  strategy: z.enum(["basis_reversion", "funding_reversion", "cmc_basis_reversion"]),
  rationale: z.string(),
  config: AiBotConfigSchema,
});
export type BotDesign = z.infer<typeof BotDesignSchema>;
