import type { AssetSnapshot } from "../hyperliquid/types.js";
import { makeSignalId, type Signal } from "./types.js";

/** Perp mark price vs oracle price. Hyperliquid's oracle price is the
 * exchange's own reference (median of external venues), so a mark price that
 * drifts away from it reflects Hyperliquid-local order flow/positioning
 * pressure that tends to mean-revert as funding and arbitrageurs pull it back.
 *
 * gapPct > 0 → mark trades above oracle → expect reversion down → short.
 * gapPct < 0 → mark trades below oracle → expect reversion up → long.
 */
export function computeBasisSignals(
  snapshots: AssetSnapshot[],
  thresholdPct: number,
): Signal[] {
  const now = Date.now();
  const signals: Signal[] = [];

  for (const s of snapshots) {
    const gapPct = ((s.markPx - s.oraclePx) / s.oraclePx) * 100;
    if (Math.abs(gapPct) < thresholdPct) continue;

    signals.push({
      id: makeSignalId("basis", s.coin),
      type: "basis",
      coin: s.coin,
      value: Math.abs(gapPct),
      direction: gapPct > 0 ? "short" : "long",
      context: {
        gapPct: round(gapPct, 4),
        markPx: s.markPx,
        oraclePx: s.oraclePx,
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
