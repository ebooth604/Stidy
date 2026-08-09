import { z } from "zod";

export const BotConfigSchema = z.object({
  minSignalValue: z.number().positive(),
  stopLossPct: z.number().positive(),
  takeProfitPct: z.number().positive(),
  positionSizeUsd: z.number().positive(),
  maxPositions: z.number().int().positive(),
  maxDrawdownPct: z.number().min(0),
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
  suggestedConfig: BotConfigSchema,
});
export type TuningSuggestion = z.infer<typeof TuningSuggestionSchema>;

export const BotDesignSchema = z.object({
  name: z.string(),
  strategy: z.enum(["basis_reversion", "funding_reversion", "cmc_basis_reversion"]),
  rationale: z.string(),
  config: BotConfigSchema,
});
export type BotDesign = z.infer<typeof BotDesignSchema>;
