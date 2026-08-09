import { describe, expect, it } from "vitest";
import type { WsTrade } from "../hyperliquid/types.js";
import { WhaleTradeTracker } from "../signals/whales.js";

function trade(overrides: Partial<WsTrade>): WsTrade {
  return {
    coin: "BTC",
    side: "B",
    px: "100",
    sz: "1",
    hash: "0xabc",
    time: Date.now(),
    tid: 1,
    users: ["0x1", "0x2"],
    ...overrides,
  };
}

describe("WhaleTradeTracker", () => {
  it("ignores trades below the notional threshold", () => {
    const tracker = new WhaleTradeTracker(250_000);
    const fired = tracker.ingest([trade({ px: "100", sz: "10" })]); // $1,000
    expect(fired).toHaveLength(0);
  });

  it("fires a long signal for a large buy print", () => {
    const tracker = new WhaleTradeTracker(250_000);
    const fired = tracker.ingest([trade({ coin: "BTC", side: "B", px: "65000", sz: "10" })]); // $650,000
    expect(fired).toHaveLength(1);
    expect(fired[0].direction).toBe("long");
    expect(fired[0].coin).toBe("BTC");
    expect(fired[0].value).toBeCloseTo(650_000, 0);
  });

  it("fires a short signal for a large sell print", () => {
    const tracker = new WhaleTradeTracker(250_000);
    const fired = tracker.ingest([trade({ side: "A", px: "65000", sz: "10" })]);
    expect(fired[0].direction).toBe("short");
  });

  it("tracks net buy/sell imbalance across ingested trades", () => {
    const tracker = new WhaleTradeTracker(250_000);
    tracker.ingest([
      trade({ coin: "ETH", side: "B", px: "3000", sz: "200" }), // +$600,000
      trade({ coin: "ETH", side: "A", px: "3000", sz: "50" }), // -$150,000
      trade({ coin: "SOL", side: "B", px: "150", sz: "10" }), // +$1,500 (below threshold, still tracked for imbalance)
    ]);
    const imbalances = tracker.getImbalances();
    const eth = imbalances.find((i) => i.coin === "ETH");
    expect(eth?.netUsd).toBeCloseTo(450_000, 0);
    expect(eth?.buyUsd).toBeCloseTo(600_000, 0);
    expect(eth?.sellUsd).toBeCloseTo(150_000, 0);
  });

  it("sorts imbalances by absolute net notional", () => {
    const tracker = new WhaleTradeTracker(250_000);
    tracker.ingest([
      trade({ coin: "small", side: "B", px: "10", sz: "10" }),
      trade({ coin: "big", side: "B", px: "1000", sz: "100" }),
    ]);
    expect(tracker.getImbalances()[0].coin).toBe("big");
  });
});
