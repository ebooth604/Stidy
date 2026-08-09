import type { Signal } from "../../signals/types.js";
import type { BotConfig, TradeIntent } from "../types.js";
import { selectTradeIntents } from "./common.js";

/** Bets that a perp's mark price reverts back toward Hyperliquid's oracle
 * price once the gap exceeds the bot's threshold. Direction is inherited
 * from the basis signal: mark below oracle → long, mark above → short.
 */
export function evaluateBasisReversion(
  signals: Signal[],
  config: BotConfig,
  heldCoins: ReadonlySet<string>,
): TradeIntent[] {
  return selectTradeIntents(signals, "basis", config, heldCoins);
}
