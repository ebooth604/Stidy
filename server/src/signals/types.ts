export type SignalType = "basis" | "funding" | "whale_trade" | "cmc_basis";
export type Direction = "long" | "short" | "neutral";

/** A single tradable observation. `value` is always a positive magnitude so
 * callers can sort/rank across signal types; `direction` carries the bias and
 * `context` carries the raw numbers a human (or the AI digest) needs to judge it.
 */
export interface Signal {
  id: string;
  type: SignalType;
  coin: string;
  value: number;
  direction: Direction;
  context: Record<string, unknown>;
  createdAt: number;
}

export function makeSignalId(type: SignalType, coin: string): string {
  return `${type}-${coin}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
