import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveTradingEngine } from "../bots/liveEngine.js";
import { DEFAULT_BOT_CONFIG } from "../bots/types.js";
import { createDb, type AppDb } from "../db/client.js";
import { botsTable, livePositionsTable, liveTradesTable } from "../db/schema.js";
import type { LiveAccountState, LiveExchange, OrderFill, PlaceMarketOrderParams } from "../hyperliquid/liveExchange.js";
import type { Signal } from "../signals/types.js";

function fakeSignalEngine(basis: Signal[], prices: Record<string, number>) {
  return {
    getLatestSignals: () => ({ basis, funding: [], whaleTrades: [], cmcBasis: [] }),
    getPriceForCoin: (coin: string) => prices[coin] ?? null,
    getWhaleImbalances: () => [],
    getSnapshots: () => [],
  } as any;
}

function fakeExchange(overrides: Partial<LiveExchange> = {}): LiveExchange {
  return {
    getAccountState: async (): Promise<LiveAccountState> => ({
      accountValue: 100_000,
      withdrawable: 100_000,
      totalMarginUsed: 0,
      positions: [],
    }),
    placeMarketOrder: async (params: PlaceMarketOrderParams): Promise<OrderFill> => ({
      filledQty: params.quantity ?? (params.sizeUsd as number) / params.referencePrice,
      avgPrice: params.referencePrice,
    }),
    ...overrides,
  };
}

function insertBot(db: AppDb, overrides: Partial<{ enabled: boolean; config: object }> = {}) {
  const id = crypto.randomUUID();
  db.insert(botsTable)
    .values({
      id,
      name: "live-test-bot",
      strategy: "basis_reversion",
      enabled: overrides.enabled ?? true,
      config: JSON.stringify({ ...DEFAULT_BOT_CONFIG, liveTrading: true, ...overrides.config }),
      pollIntervalSeconds: 15,
      lastRunAt: null,
    })
    .run();
  return id;
}

function basisSignal(coin: string, direction: "long" | "short", markPx: number, value = 1): Signal {
  return {
    id: `basis-${coin}`,
    type: "basis",
    coin,
    value,
    direction,
    context: { markPx, oraclePx: markPx, gapPct: 0 },
    createdAt: Date.now(),
  };
}

describe("LiveTradingEngine", () => {
  let db: AppDb;

  beforeEach(() => {
    db = createDb(":memory:").db;
  });

  it("ignores bots without liveTrading:true", async () => {
    insertBot(db, { config: { liveTrading: false, positionSizeUsd: 50 } });
    const engine = new LiveTradingEngine(db, fakeSignalEngine([basisSignal("BTC", "long", 100)], { BTC: 100 }), fakeExchange());

    await (engine as any).runTick();

    expect(db.select().from(livePositionsTable).all()).toHaveLength(0);
  });

  it("opens a live position using the exchange's ACTUAL fill, not the signal price", async () => {
    const botId = insertBot(db, { config: { positionSizeUsd: 50, minSignalValue: 0.2 } });
    // Fake fill price deliberately differs from the 100 reference price to prove slippage is respected.
    const exchange = fakeExchange({
      placeMarketOrder: async () => ({ filledQty: 0.49, avgPrice: 101.5 }),
    });
    const engine = new LiveTradingEngine(db, fakeSignalEngine([basisSignal("BTC", "long", 100)], { BTC: 100 }), exchange);

    await (engine as any).runTick();

    const positions = db.select().from(livePositionsTable).all();
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ botId, coin: "BTC", side: "long", entryPrice: 101.5, quantity: 0.49 });
  });

  it("refuses to open when the bot's positionSizeUsd exceeds the live order cap", async () => {
    vi.stubEnv("HYPERLIQUID_LIVE_MAX_ORDER_USD", "40");
    vi.resetModules();
    const { LiveTradingEngine: FreshEngine } = await import("../bots/liveEngine.js");
    const { DEFAULT_BOT_CONFIG: FreshDefault } = await import("../bots/types.js");
    const { botsTable: freshBotsTable } = await import("../db/schema.js");
    const { livePositionsTable: freshPositions } = await import("../db/schema.js");
    const { createDb: freshCreateDb } = await import("../db/client.js");

    const freshDb = freshCreateDb(":memory:").db;
    freshDb
      .insert(freshBotsTable)
      .values({
        id: crypto.randomUUID(),
        name: "over-cap",
        strategy: "basis_reversion",
        enabled: true,
        config: JSON.stringify({ ...FreshDefault, liveTrading: true, positionSizeUsd: 50, minSignalValue: 0.2 }),
        pollIntervalSeconds: 15,
        lastRunAt: null,
      })
      .run();

    const engine = new FreshEngine(freshDb, fakeSignalEngine([basisSignal("BTC", "long", 100)], { BTC: 100 }), fakeExchange());
    await (engine as any).runTick();

    expect(freshDb.select().from(freshPositions).all()).toHaveLength(0);
    vi.unstubAllEnvs();
  });

  it("skips opening when withdrawable margin is insufficient", async () => {
    insertBot(db, { config: { positionSizeUsd: 50, minSignalValue: 0.2 } });
    const exchange = fakeExchange({
      getAccountState: async () => ({ accountValue: 10, withdrawable: 10, totalMarginUsed: 0, positions: [] }),
    });
    const engine = new LiveTradingEngine(db, fakeSignalEngine([basisSignal("BTC", "long", 100)], { BTC: 100 }), exchange);

    await (engine as any).runTick();

    expect(db.select().from(livePositionsTable).all()).toHaveLength(0);
  });

  it("does not record a position when the order throws (rejected)", async () => {
    insertBot(db, { config: { positionSizeUsd: 50, minSignalValue: 0.2 } });
    const exchange = fakeExchange({
      placeMarketOrder: async () => {
        throw new Error("Order rejected: insufficient margin");
      },
    });
    const engine = new LiveTradingEngine(db, fakeSignalEngine([basisSignal("BTC", "long", 100)], { BTC: 100 }), exchange);

    await (engine as any).runTick();

    expect(db.select().from(livePositionsTable).all()).toHaveLength(0);
  });

  it("closes a position via a reduce-only order for the exact held quantity on take-profit", async () => {
    const botId = insertBot(db, {
      config: { positionSizeUsd: 50, minSignalValue: 0.2, takeProfitPct: 1, stopLossPct: 1 },
    });
    const openExchange = fakeExchange({ placeMarketOrder: async () => ({ filledQty: 0.5, avgPrice: 100 }) });
    const openEngine = new LiveTradingEngine(db, fakeSignalEngine([basisSignal("BTC", "long", 100)], { BTC: 100 }), openExchange);
    await (openEngine as any).runTick();

    let closeCallParams: PlaceMarketOrderParams | undefined;
    const closeExchange = fakeExchange({
      placeMarketOrder: async (params) => {
        closeCallParams = params;
        return { filledQty: params.quantity ?? 0.5, avgPrice: 102 };
      },
    });
    const closeEngine = new LiveTradingEngine(db, fakeSignalEngine([], { BTC: 102 }), closeExchange);
    await (closeEngine as any).runTick();

    expect(closeCallParams).toMatchObject({ coin: "BTC", side: "short", quantity: 0.5, reduceOnly: true });

    const positions = db.select().from(livePositionsTable).all();
    expect(positions[0].status).toBe("closed");
    expect(positions[0].pnl).toBeGreaterThan(0);

    const trades = db.select().from(liveTradesTable).where(eq(liveTradesTable.botId, botId)).all();
    expect(trades).toHaveLength(1);
    expect(trades[0].closeReason).toBe("take_profit");
  });

  it("leaves the position open when the close order throws (will retry next tick)", async () => {
    insertBot(db, { config: { positionSizeUsd: 50, minSignalValue: 0.2, takeProfitPct: 1, stopLossPct: 1 } });
    const openEngine = new LiveTradingEngine(
      db,
      fakeSignalEngine([basisSignal("BTC", "long", 100)], { BTC: 100 }),
      fakeExchange({ placeMarketOrder: async () => ({ filledQty: 0.5, avgPrice: 100 }) }),
    );
    await (openEngine as any).runTick();

    const failingEngine = new LiveTradingEngine(
      db,
      fakeSignalEngine([], { BTC: 102 }),
      fakeExchange({
        placeMarketOrder: async () => {
          throw new Error("network error");
        },
      }),
    );
    await (failingEngine as any).runTick();

    expect(db.select().from(livePositionsTable).all()[0].status).toBe("open");
  });

  it("manually closes an open position on request", async () => {
    insertBot(db, { config: { positionSizeUsd: 50, minSignalValue: 0.2 } });
    const openEngine = new LiveTradingEngine(
      db,
      fakeSignalEngine([basisSignal("BTC", "long", 100)], { BTC: 100 }),
      fakeExchange({ placeMarketOrder: async () => ({ filledQty: 0.5, avgPrice: 100 }) }),
    );
    await (openEngine as any).runTick();

    const posId = db.select().from(livePositionsTable).all()[0].id;
    const closeEngine = new LiveTradingEngine(
      db,
      fakeSignalEngine([], { BTC: 100 }),
      fakeExchange({ placeMarketOrder: async () => ({ filledQty: 0.5, avgPrice: 100 }) }),
    );
    const closed = await closeEngine.closePositionManually(posId);
    expect(closed).toBe(true);
    expect(db.select().from(livePositionsTable).all()[0].status).toBe("closed");

    expect(await closeEngine.closePositionManually(posId)).toBe(false);
  });

  it("never touches a null exchange (live trading turned off after a position was opened)", async () => {
    insertBot(db, { config: { positionSizeUsd: 50, minSignalValue: 0.2, takeProfitPct: 1, stopLossPct: 1 } });
    const openEngine = new LiveTradingEngine(
      db,
      fakeSignalEngine([basisSignal("BTC", "long", 100)], { BTC: 100 }),
      fakeExchange({ placeMarketOrder: async () => ({ filledQty: 0.5, avgPrice: 100 }) }),
    );
    await (openEngine as any).runTick();

    const engineWithoutExchange = new LiveTradingEngine(db, fakeSignalEngine([], { BTC: 102 }), null);
    await expect((engineWithoutExchange as any).runTick()).resolves.not.toThrow();
    expect(db.select().from(livePositionsTable).all()[0].status).toBe("open");
  });
});
