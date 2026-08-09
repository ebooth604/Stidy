import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toCmcSymbol } from "../external/coinmarketcap.js";

describe("toCmcSymbol", () => {
  it("maps k-prefixed Hyperliquid tickers to their underlying CMC symbol", () => {
    expect(toCmcSymbol("kPEPE")).toBe("PEPE");
    expect(toCmcSymbol("kSHIB")).toBe("SHIB");
    expect(toCmcSymbol("kBONK")).toBe("BONK");
  });

  it("passes through unmapped tickers unchanged", () => {
    expect(toCmcSymbol("BTC")).toBe("BTC");
    expect(toCmcSymbol("ETH")).toBe("ETH");
  });
});

// config.ts reads CMC_API_KEY once at module-load time, so these tests reset
// the module registry and re-import after stubbing the env var each time.
describe("getSpotPrices", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("CMC_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns an empty map for an empty symbol list without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { getSpotPrices } = await import("../external/coinmarketcap.js");
    expect(await getSpotPrices([])).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses the v2 quotes response, preferring the active/lowest-rank entry per symbol", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            BTC: [{ symbol: "BTC", is_active: 1, cmc_rank: 1, quote: { USD: { price: 65000 } } }],
            // Duplicate ticker case: inactive/high-rank entry should lose to the active one.
            LUNA: [
              { symbol: "LUNA", is_active: 0, cmc_rank: 5000, quote: { USD: { price: 0.0001 } } },
              { symbol: "LUNA", is_active: 1, cmc_rank: 400, quote: { USD: { price: 0.5 } } },
            ],
          },
        }),
      })),
    );

    const { getSpotPrices } = await import("../external/coinmarketcap.js");
    const prices = await getSpotPrices(["BTC", "LUNA"]);
    expect(prices.BTC).toBe(65000);
    expect(prices.LUNA).toBe(0.5);
  });

  it("throws with status context on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, text: async () => "invalid key" })));
    const { getSpotPrices } = await import("../external/coinmarketcap.js");
    await expect(getSpotPrices(["BTC"])).rejects.toThrow(/401/);
  });

  it("throws when no API key is configured", async () => {
    vi.stubEnv("CMC_API_KEY", "");
    vi.resetModules();
    const { getSpotPrices } = await import("../external/coinmarketcap.js");
    await expect(getSpotPrices(["BTC"])).rejects.toThrow(/not configured/);
  });
});
