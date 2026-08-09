import { describe, expect, it } from "vitest";
import type { AssetSnapshot } from "../hyperliquid/types.js";
import { computeBasisSignals } from "../signals/basis.js";

function snap(overrides: Partial<AssetSnapshot>): AssetSnapshot {
  return {
    coin: "BTC",
    markPx: 100,
    oraclePx: 100,
    midPx: 100,
    fundingHourly: 0,
    openInterest: 1000,
    dayNtlVlm: 1_000_000,
    prevDayPx: 100,
    ...overrides,
  };
}

describe("computeBasisSignals", () => {
  it("ignores gaps below threshold", () => {
    const signals = computeBasisSignals([snap({ markPx: 100.05, oraclePx: 100 })], 0.15);
    expect(signals).toHaveLength(0);
  });

  it("flags a long when mark trades below oracle", () => {
    const signals = computeBasisSignals([snap({ coin: "ETH", markPx: 99, oraclePx: 100 })], 0.15);
    expect(signals).toHaveLength(1);
    expect(signals[0].direction).toBe("long");
    expect(signals[0].coin).toBe("ETH");
    expect(signals[0].value).toBeCloseTo(1, 5);
    expect(signals[0].context.gapPct).toBeCloseTo(-1, 5);
  });

  it("flags a short when mark trades above oracle", () => {
    const signals = computeBasisSignals([snap({ coin: "SOL", markPx: 101, oraclePx: 100 })], 0.15);
    expect(signals[0].direction).toBe("short");
    expect(signals[0].context.gapPct).toBeCloseTo(1, 5);
  });

  it("sorts by descending magnitude", () => {
    const signals = computeBasisSignals(
      [
        snap({ coin: "small", markPx: 100.3, oraclePx: 100 }),
        snap({ coin: "big", markPx: 102, oraclePx: 100 }),
      ],
      0.15,
    );
    expect(signals.map((s) => s.coin)).toEqual(["big", "small"]);
  });
});
