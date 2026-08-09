import { describe, expect, it } from "vitest";
import type { AssetSnapshot } from "../hyperliquid/types.js";
import { computeCmcBasisSignals } from "../signals/cmcBasis.js";

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

describe("computeCmcBasisSignals", () => {
  it("ignores coins with no matching CMC price", () => {
    const signals = computeCmcBasisSignals([snap({ coin: "BTC", markPx: 110 })], {}, 0.25);
    expect(signals).toHaveLength(0);
  });

  it("flags a long when Hyperliquid trades below the CMC spot price", () => {
    const signals = computeCmcBasisSignals([snap({ coin: "BTC", markPx: 99 })], { BTC: 100 }, 0.25);
    expect(signals).toHaveLength(1);
    expect(signals[0].direction).toBe("long");
    expect(signals[0].type).toBe("cmc_basis");
    expect(signals[0].context.cmcSymbol).toBe("BTC");
  });

  it("flags a short when Hyperliquid trades above the CMC spot price", () => {
    const signals = computeCmcBasisSignals([snap({ coin: "BTC", markPx: 101 })], { BTC: 100 }, 0.25);
    expect(signals[0].direction).toBe("short");
  });

  it("maps Hyperliquid's k-prefixed tickers to the underlying CMC symbol", () => {
    const signals = computeCmcBasisSignals([snap({ coin: "kPEPE", markPx: 0.0102 })], { PEPE: 0.01 }, 0.25);
    expect(signals).toHaveLength(1);
    expect(signals[0].coin).toBe("kPEPE");
    expect(signals[0].context.cmcSymbol).toBe("PEPE");
  });

  it("ignores gaps below threshold", () => {
    const signals = computeCmcBasisSignals([snap({ coin: "BTC", markPx: 100.1 })], { BTC: 100 }, 0.25);
    expect(signals).toHaveLength(0);
  });
});
