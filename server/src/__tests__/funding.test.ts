import { describe, expect, it } from "vitest";
import type { AssetSnapshot } from "../hyperliquid/types.js";
import { computeFundingSignals } from "../signals/funding.js";

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

describe("computeFundingSignals", () => {
  it("ignores modest funding rates", () => {
    // 0.0001%/hr ≈ 0.876% APR — well under a 30% threshold
    const signals = computeFundingSignals([snap({ fundingHourly: 0.000001 })], 30);
    expect(signals).toHaveLength(0);
  });

  it("flags a short when longs are paying heavily (positive funding)", () => {
    // 0.02%/hr * 24 * 365 ≈ 175% APR
    const signals = computeFundingSignals([snap({ coin: "HYPE", fundingHourly: 0.0002 })], 30);
    expect(signals).toHaveLength(1);
    expect(signals[0].direction).toBe("short");
    expect(signals[0].context.fundingApr).toBeGreaterThan(100);
  });

  it("flags a long when shorts are paying heavily (negative funding)", () => {
    const signals = computeFundingSignals([snap({ coin: "DOGE", fundingHourly: -0.0002 })], 30);
    expect(signals[0].direction).toBe("long");
  });

  it("carries openInterest and markPx through to context", () => {
    const signals = computeFundingSignals(
      [snap({ coin: "BTC", fundingHourly: 0.0002, openInterest: 4200, markPx: 65000 })],
      30,
    );
    expect(signals[0].context.openInterest).toBe(4200);
    expect(signals[0].context.markPx).toBe(65000);
  });
});
