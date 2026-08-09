import type { Signal, SignalType } from "../../signals/types.js";
import type { BotConfig, TradeIntent } from "../types.js";

/** Shared filter/rank logic: signals of the right type, strong enough, on a
 * coin the bot doesn't already hold, best-first.
 */
export function selectTradeIntents(
  signals: Signal[],
  signalType: SignalType,
  config: BotConfig,
  heldCoins: ReadonlySet<string>,
): TradeIntent[] {
  return signals
    .filter(
      (s) =>
        s.type === signalType &&
        s.value >= config.minSignalValue &&
        !heldCoins.has(s.coin) &&
        typeof s.context.markPx === "number",
    )
    .sort((a, b) => b.value - a.value)
    .map((s) => ({
      coin: s.coin,
      side: s.direction as "long" | "short",
      entryPrice: s.context.markPx as number,
      signalId: s.id,
      signalValue: s.value,
    }));
}
