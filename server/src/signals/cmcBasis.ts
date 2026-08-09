import { toCmcSymbol } from "../external/coinmarketcap.js";
import type { AssetSnapshot } from "../hyperliquid/types.js";
import { makeSignalId, type Signal } from "./types.js";

/** Cross-checks Hyperliquid's own perp mark price against an independent,
 * broad-market reference (CoinMarketCap's aggregated spot price) rather than
 * Hyperliquid's internal oracle. This is the closer analog to bitcompare's
 * original "AsterDex futures vs CMC spot" comparison — it catches cases
 * where Hyperliquid's oracle itself has drifted from the wider market, which
 * the basis-vs-oracle signal can't see.
 *
 * gapPct > 0 → Hyperliquid trades above the broader market → short.
 * gapPct < 0 → Hyperliquid trades below the broader market → long.
 */
export function computeCmcBasisSignals(
  snapshots: AssetSnapshot[],
  cmcSpotPrices: Record<string, number>,
  thresholdPct: number,
): Signal[] {
  const now = Date.now();
  const signals: Signal[] = [];

  for (const s of snapshots) {
    const cmcSymbol = toCmcSymbol(s.coin);
    const spotPx = cmcSpotPrices[cmcSymbol];
    if (!spotPx || !Number.isFinite(spotPx) || spotPx === 0) continue;

    const gapPct = ((s.markPx - spotPx) / spotPx) * 100;
    if (Math.abs(gapPct) < thresholdPct) continue;

    signals.push({
      id: makeSignalId("cmc_basis", s.coin),
      type: "cmc_basis",
      coin: s.coin,
      value: Math.abs(gapPct),
      direction: gapPct > 0 ? "short" : "long",
      context: {
        gapPct: round(gapPct, 4),
        markPx: s.markPx,
        cmcSpotPx: spotPx,
        cmcSymbol,
      },
      createdAt: now,
    });
  }

  return signals.sort((a, b) => b.value - a.value);
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
