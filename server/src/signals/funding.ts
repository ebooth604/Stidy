import type { AssetSnapshot } from "../hyperliquid/types.js";
import { makeSignalId, type Signal } from "./types.js";

/** Hyperliquid settles funding hourly; `fundingHourly` is the fractional rate
 * paid by longs to shorts (negative = shorts pay longs). Annualizing it turns
 * a tiny hourly number into a comparable "cost of staying in this position"
 * figure. Extreme funding means the crowd is heavily one-sided and paying up
 * to stay there — a classic fade/mean-reversion setup.
 *
 * fundingApr > 0 → longs paying a lot → crowd is long → fade with short.
 * fundingApr < 0 → shorts paying a lot → crowd is short → fade with long.
 */
export function computeFundingSignals(
  snapshots: AssetSnapshot[],
  thresholdAprPct: number,
): Signal[] {
  const now = Date.now();
  const signals: Signal[] = [];

  for (const s of snapshots) {
    const fundingApr = s.fundingHourly * 24 * 365 * 100;
    if (Math.abs(fundingApr) < thresholdAprPct) continue;

    signals.push({
      id: makeSignalId("funding", s.coin),
      type: "funding",
      coin: s.coin,
      value: Math.abs(fundingApr),
      direction: fundingApr > 0 ? "short" : "long",
      context: {
        fundingApr: round(fundingApr, 2),
        fundingHourly: s.fundingHourly,
        openInterest: s.openInterest,
        markPx: s.markPx,
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
