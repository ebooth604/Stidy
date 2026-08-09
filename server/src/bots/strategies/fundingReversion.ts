import type { Signal } from "../../signals/types.js";
import type { BotConfig, TradeIntent } from "../types.js";
import { selectTradeIntents } from "./common.js";

/** Fades extreme funding: when one side of the market is paying heavily to
 * stay positioned, bets that the crowd unwinds. Direction is inherited from
 * the funding signal: longs paying (positive funding) → short, shorts paying
 * (negative funding) → long.
 */
export function evaluateFundingReversion(
  signals: Signal[],
  config: BotConfig,
  heldCoins: ReadonlySet<string>,
): TradeIntent[] {
  return selectTradeIntents(signals, "funding", config, heldCoins);
}
