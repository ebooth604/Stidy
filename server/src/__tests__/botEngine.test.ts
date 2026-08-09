import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BotEngine } from "../bots/engine.js";
import { DEFAULT_BOT_CONFIG } from "../bots/types.js";
import { createDb, SINGLETON_ACCOUNT_ID, type AppDb } from "../db/client.js";
import { botsTable, paperAccountTable, paperPositionsTable, paperTradesTable } from "../db/schema.js";
import type { Signal } from "../signals/types.js";

/** Minimal stand-in for SignalEngine — BotEngine only calls these two methods. */
function fakeSignalEngine(basis: Signal[], prices: Record<string, number>) {
  return {
    getLatestSignals: () => ({ basis, funding: [], whaleTrades: [] }),
    getPriceForCoin: (coin: string) => prices[coin] ?? null,
    getWhaleImbalances: () => [],
    getSnapshots: () => [],
  } as any;
}

function insertBot(db: AppDb, overrides: Partial<{ enabled: boolean; config: object }> = {}) {
  const id = crypto.randomUUID();
  db.insert(botsTable)
    .values({
      id,
      name: "test-bot",
      strategy: "basis_reversion",
      enabled: overrides.enabled ?? true,
      config: JSON.stringify({ ...DEFAULT_BOT_CONFIG, ...overrides.config }),
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

describe("BotEngine", () => {
  let db: AppDb;

  beforeEach(() => {
    db = createDb(":memory:").db;
  });

  it("opens a paper position and deducts the account balance", () => {
    const botId = insertBot(db, { config: { positionSizeUsd: 1000, minSignalValue: 0.2 } });
    const engine = new BotEngine(db, fakeSignalEngine([basisSignal("BTC", "long", 100)], { BTC: 100 }));

    (engine as any).tick();

    const positions = db.select().from(paperPositionsTable).all();
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ botId, coin: "BTC", side: "long", status: "open" });

    const account = db.select().from(paperAccountTable).where(eq(paperAccountTable.id, SINGLETON_ACCOUNT_ID)).get();
    expect(account?.balance).toBeCloseTo(99_000, 2);
  });

  it("does not open a second position on the same coin for the same bot", () => {
    insertBot(db, { config: { positionSizeUsd: 1000, minSignalValue: 0.2 } });
    const engine = new BotEngine(db, fakeSignalEngine([basisSignal("BTC", "long", 100)], { BTC: 100 }));

    (engine as any).tick();
    // Force lastRunAt back so a second tick is eligible to run again.
    db.update(botsTable).set({ lastRunAt: null }).run();
    (engine as any).tick();

    expect(db.select().from(paperPositionsTable).all()).toHaveLength(1);
  });

  it("closes a long position for a profit when price rises through take-profit", () => {
    const botId = insertBot(db, {
      config: { positionSizeUsd: 1000, minSignalValue: 0.2, takeProfitPct: 1, stopLossPct: 1 },
    });
    const engine = new BotEngine(db, fakeSignalEngine([basisSignal("BTC", "long", 100)], { BTC: 100 }));
    (engine as any).tick();

    // Price now above the 1% take-profit (101) — reconstruct engine with new price and re-tick.
    const engine2 = new BotEngine(db, fakeSignalEngine([], { BTC: 102 }));
    (engine2 as any).tick();

    const positions = db.select().from(paperPositionsTable).all();
    expect(positions[0].status).toBe("closed");
    expect(positions[0].pnl).toBeGreaterThan(0);

    const trades = db.select().from(paperTradesTable).where(eq(paperTradesTable.botId, botId)).all();
    expect(trades).toHaveLength(1);
    expect(trades[0].closeReason).toBe("take_profit");

    const account = db.select().from(paperAccountTable).where(eq(paperAccountTable.id, SINGLETON_ACCOUNT_ID)).get();
    expect(account?.balance).toBeGreaterThan(100_000); // margin + profit returned
  });

  it("closes a long position for a loss when price falls through stop-loss", () => {
    insertBot(db, { config: { positionSizeUsd: 1000, minSignalValue: 0.2, takeProfitPct: 1, stopLossPct: 1 } });
    const engine = new BotEngine(db, fakeSignalEngine([basisSignal("BTC", "long", 100)], { BTC: 100 }));
    (engine as any).tick();

    const engine2 = new BotEngine(db, fakeSignalEngine([], { BTC: 98 }));
    (engine2 as any).tick();

    const positions = db.select().from(paperPositionsTable).all();
    expect(positions[0].status).toBe("stopped");
    expect(positions[0].pnl).toBeLessThan(0);
  });

  it("respects the drawdown gate and refuses new entries once breached", () => {
    insertBot(db, { config: { positionSizeUsd: 1000, minSignalValue: 0.2, maxDrawdownPct: 5 } });
    db.update(paperAccountTable)
      .set({ balance: 90_000, peakBalance: 100_000 }) // 10% drawdown > 5% gate
      .where(eq(paperAccountTable.id, SINGLETON_ACCOUNT_ID))
      .run();

    const engine = new BotEngine(db, fakeSignalEngine([basisSignal("BTC", "long", 100)], { BTC: 100 }));
    (engine as any).tick();

    expect(db.select().from(paperPositionsTable).all()).toHaveLength(0);
  });

  it("manually closes an open position on request", () => {
    insertBot(db, { config: { positionSizeUsd: 1000, minSignalValue: 0.2 } });
    const engine = new BotEngine(db, fakeSignalEngine([basisSignal("BTC", "long", 100)], { BTC: 100 }));
    (engine as any).tick();

    const posId = db.select().from(paperPositionsTable).all()[0].id;
    const closed = engine.closePositionManually(posId);
    expect(closed).toBe(true);
    expect(db.select().from(paperPositionsTable).all()[0].status).toBe("closed");

    expect(engine.closePositionManually(posId)).toBe(false);
  });
});
