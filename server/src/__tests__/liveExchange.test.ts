import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const FAKE_PRIVATE_KEY = `0x${"1".repeat(64)}`;
const FAKE_ACCOUNT_ADDRESS = `0x${"2".repeat(40)}`;

describe("isLiveTradingConfigured", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is false when nothing is set", async () => {
    const { isLiveTradingConfigured } = await import("../hyperliquid/liveExchange.js");
    expect(isLiveTradingConfigured()).toBe(false);
  });

  it("is false if the kill switch is off even with credentials present", async () => {
    vi.stubEnv("HYPERLIQUID_LIVE_TRADING_ENABLED", "false");
    vi.stubEnv("HYPERLIQUID_API_WALLET_PRIVATE_KEY", FAKE_PRIVATE_KEY);
    vi.stubEnv("HYPERLIQUID_ACCOUNT_ADDRESS", FAKE_ACCOUNT_ADDRESS);
    const { isLiveTradingConfigured } = await import("../hyperliquid/liveExchange.js");
    expect(isLiveTradingConfigured()).toBe(false);
  });

  it("is false if the account address is missing", async () => {
    vi.stubEnv("HYPERLIQUID_LIVE_TRADING_ENABLED", "true");
    vi.stubEnv("HYPERLIQUID_API_WALLET_PRIVATE_KEY", FAKE_PRIVATE_KEY);
    const { isLiveTradingConfigured } = await import("../hyperliquid/liveExchange.js");
    expect(isLiveTradingConfigured()).toBe(false);
  });

  it("is true only when the kill switch, key, and address are all present", async () => {
    vi.stubEnv("HYPERLIQUID_LIVE_TRADING_ENABLED", "true");
    vi.stubEnv("HYPERLIQUID_API_WALLET_PRIVATE_KEY", FAKE_PRIVATE_KEY);
    vi.stubEnv("HYPERLIQUID_ACCOUNT_ADDRESS", FAKE_ACCOUNT_ADDRESS);
    const { isLiveTradingConfigured } = await import("../hyperliquid/liveExchange.js");
    expect(isLiveTradingConfigured()).toBe(true);
  });
});

describe("HyperliquidLiveExchange", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("refuses to construct when live trading is not configured", async () => {
    const { HyperliquidLiveExchange } = await import("../hyperliquid/liveExchange.js");
    expect(() => new HyperliquidLiveExchange()).toThrow(/not configured/);
  });

  async function buildConfiguredExchange(maxOrderUsd = "100") {
    vi.stubEnv("HYPERLIQUID_LIVE_TRADING_ENABLED", "true");
    vi.stubEnv("HYPERLIQUID_API_WALLET_PRIVATE_KEY", FAKE_PRIVATE_KEY);
    vi.stubEnv("HYPERLIQUID_ACCOUNT_ADDRESS", FAKE_ACCOUNT_ADDRESS);
    vi.stubEnv("HYPERLIQUID_LIVE_MAX_ORDER_USD", maxOrderUsd);
    const { HyperliquidLiveExchange } = await import("../hyperliquid/liveExchange.js");
    return new HyperliquidLiveExchange();
  }

  it("refuses an order whose sizeUsd exceeds the hard cap, without any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const exchange = await buildConfiguredExchange("100");

    await expect(
      exchange.placeMarketOrder({ coin: "BTC", side: "long", sizeUsd: 500, referencePrice: 100, reduceOnly: false }),
    ).rejects.toThrow(/exceeds the configured live-trading cap/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("computes the cap check from quantity * referencePrice when quantity is given (closes)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const exchange = await buildConfiguredExchange("100");

    // 10 units * $50 = $500 notional, well over the $100 cap, even though no sizeUsd was passed.
    await expect(
      exchange.placeMarketOrder({ coin: "BTC", side: "short", quantity: 10, referencePrice: 50, reduceOnly: true }),
    ).rejects.toThrow(/exceeds the configured live-trading cap/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows an order right at the cap to proceed past the cap check", async () => {
    // Anything past the cap check will hit the network (SymbolConverter fetch), which we don't
    // want to actually perform in a unit test — assert it gets that far by checking fetch WAS called.
    const fetchMock = vi.fn(async () => {
      throw new Error("network disabled in test");
    });
    vi.stubGlobal("fetch", fetchMock);
    const exchange = await buildConfiguredExchange("100");

    await expect(
      exchange.placeMarketOrder({ coin: "BTC", side: "long", sizeUsd: 100, referencePrice: 100, reduceOnly: false }),
    ).rejects.toThrow(); // rejects for network reasons, not the cap
    expect(fetchMock).toHaveBeenCalled();
  });

  it("requires either sizeUsd or quantity", async () => {
    const exchange = await buildConfiguredExchange("100");
    await expect(
      exchange.placeMarketOrder({ coin: "BTC", side: "long", referencePrice: 100, reduceOnly: false }),
    ).rejects.toThrow(/requires either sizeUsd or quantity/);
  });
});
