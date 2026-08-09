import { describe, expect, it } from "vitest";
import { evaluateBasisReversion } from "../bots/strategies/basisReversion.js";
import { evaluateFundingReversion } from "../bots/strategies/fundingReversion.js";
import { DEFAULT_BOT_CONFIG } from "../bots/types.js";
import type { Signal } from "../signals/types.js";

function basisSignal(overrides: Partial<Signal>): Signal {
  return {
    id: "id-1",
    type: "basis",
    coin: "BTC",
    value: 1,
    direction: "long",
    context: { markPx: 100, oraclePx: 101, gapPct: -1 },
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("evaluateBasisReversion", () => {
  it("turns qualifying basis signals into trade intents", () => {
    const intents = evaluateBasisReversion(
      [basisSignal({})],
      { ...DEFAULT_BOT_CONFIG, minSignalValue: 0.2 },
      new Set(),
    );
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ coin: "BTC", side: "long", entryPrice: 100 });
  });

  it("filters out signals below minSignalValue", () => {
    const intents = evaluateBasisReversion(
      [basisSignal({ value: 0.1 })],
      { ...DEFAULT_BOT_CONFIG, minSignalValue: 0.5 },
      new Set(),
    );
    expect(intents).toHaveLength(0);
  });

  it("filters out coins already held", () => {
    const intents = evaluateBasisReversion(
      [basisSignal({ coin: "ETH" })],
      { ...DEFAULT_BOT_CONFIG, minSignalValue: 0.2 },
      new Set(["ETH"]),
    );
    expect(intents).toHaveLength(0);
  });

  it("ignores funding-type signals even if mixed in", () => {
    const intents = evaluateBasisReversion(
      [{ ...basisSignal({}), type: "funding" }],
      { ...DEFAULT_BOT_CONFIG, minSignalValue: 0.2 },
      new Set(),
    );
    expect(intents).toHaveLength(0);
  });
});

describe("evaluateFundingReversion", () => {
  it("turns qualifying funding signals into trade intents", () => {
    const signal: Signal = {
      id: "f-1",
      type: "funding",
      coin: "SOL",
      value: 50,
      direction: "short",
      context: { markPx: 150, fundingApr: 50 },
      createdAt: Date.now(),
    };
    const intents = evaluateFundingReversion(
      [signal],
      { ...DEFAULT_BOT_CONFIG, minSignalValue: 30 },
      new Set(),
    );
    expect(intents).toEqual([
      { coin: "SOL", side: "short", entryPrice: 150, signalId: "f-1", signalValue: 50 },
    ]);
  });

  it("ranks strongest signal first", () => {
    const weak: Signal = {
      id: "w",
      type: "funding",
      coin: "A",
      value: 31,
      direction: "long",
      context: { markPx: 1 },
      createdAt: Date.now(),
    };
    const strong: Signal = { ...weak, id: "s", coin: "B", value: 90 };
    const intents = evaluateFundingReversion([weak, strong], { ...DEFAULT_BOT_CONFIG, minSignalValue: 30 }, new Set());
    expect(intents.map((i) => i.coin)).toEqual(["B", "A"]);
  });
});
