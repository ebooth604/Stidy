import { describe, expect, it } from "vitest";
import { computePnl, currentDrawdownPct, passesDrawdownGate } from "../bots/riskManager.js";

describe("passesDrawdownGate", () => {
  it("allows entries when the gate is disabled (0)", () => {
    expect(passesDrawdownGate(0, 100_000, 50_000)).toBe(true);
  });

  it("blocks entries once drawdown meets or exceeds the threshold", () => {
    // 20% drawdown from a 100k peak
    expect(passesDrawdownGate(20, 100_000, 80_000)).toBe(false);
    expect(passesDrawdownGate(20, 100_000, 79_999)).toBe(false);
  });

  it("allows entries when drawdown is under the threshold", () => {
    expect(passesDrawdownGate(20, 100_000, 85_000)).toBe(true);
  });
});

describe("currentDrawdownPct", () => {
  it("is zero at or above peak", () => {
    expect(currentDrawdownPct(100_000, 100_000)).toBe(0);
    expect(currentDrawdownPct(0, 50_000)).toBe(0);
  });

  it("computes percentage below peak", () => {
    expect(currentDrawdownPct(100_000, 90_000)).toBeCloseTo(10, 5);
  });
});

describe("computePnl", () => {
  it("computes long P&L", () => {
    const { pnl, pnlPct } = computePnl("long", 2, 100, 110);
    expect(pnl).toBeCloseTo(20, 5);
    expect(pnlPct).toBeCloseTo(10, 5);
  });

  it("computes short P&L", () => {
    const { pnl, pnlPct } = computePnl("short", 2, 100, 90);
    expect(pnl).toBeCloseTo(20, 5);
    expect(pnlPct).toBeCloseTo(10, 5);
  });

  it("computes losses as negative P&L", () => {
    const { pnl } = computePnl("long", 1, 100, 95);
    expect(pnl).toBeCloseTo(-5, 5);
  });
});
