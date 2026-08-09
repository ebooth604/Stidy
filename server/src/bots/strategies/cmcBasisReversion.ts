import type { Signal } from "../../signals/types.js";
import type { BotConfig, TradeIntent } from "../types.js";
import { selectTradeIntents } from "./common.js";

/** Bets that Hyperliquid's mark price reverts toward the broader market's
 * spot price (CoinMarketCap aggregate), independent of Hyperliquid's own
 * oracle. Requires CMC_API_KEY to be configured — otherwise no cmc_basis
 * signals are ever produced and this strategy simply never fires.
 */
export function evaluateCmcBasisReversion(
  signals: Signal[],
  config: BotConfig,
  heldCoins: ReadonlySet<string>,
): TradeIntent[] {
  return selectTradeIntents(signals, "cmc_basis", config, heldCoins);
}
