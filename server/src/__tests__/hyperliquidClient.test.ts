import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAssetSnapshots, getAllMids, toAssetSnapshots } from "../hyperliquid/client.js";
import type { MetaAndAssetCtxs } from "../hyperliquid/types.js";

describe("toAssetSnapshots", () => {
  it("flattens meta + assetCtxs into numeric snapshots", () => {
    const raw: MetaAndAssetCtxs = [
      { universe: [{ name: "BTC", szDecimals: 5, maxLeverage: 50 }] },
      [
        {
          funding: "0.0000125",
          openInterest: "1234.5",
          prevDayPx: "64000",
          dayNtlVlm: "500000000",
          premium: "0.0001",
          oraclePx: "65000",
          markPx: "65010",
          midPx: "65005",
          dayBaseVlm: "7700",
        },
      ],
    ];
    const snapshots = toAssetSnapshots(raw);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      coin: "BTC",
      markPx: 65010,
      oraclePx: 65000,
      midPx: 65005,
      fundingHourly: 0.0000125,
      openInterest: 1234.5,
    });
  });

  it("skips assets with a zero or non-numeric oracle price", () => {
    const raw: MetaAndAssetCtxs = [
      { universe: [{ name: "BAD", szDecimals: 2, maxLeverage: 10 }] },
      [
        {
          funding: "0",
          openInterest: "0",
          prevDayPx: "0",
          dayNtlVlm: "0",
          premium: null,
          oraclePx: "0",
          markPx: "10",
          midPx: null,
          dayBaseVlm: "0",
        },
      ],
    ];
    expect(toAssetSnapshots(raw)).toHaveLength(0);
  });

  it("skips entries where meta and ctx arrays are misaligned", () => {
    const raw: MetaAndAssetCtxs = [
      { universe: [{ name: "ONLY", szDecimals: 2, maxLeverage: 10 }] },
      [],
    ];
    expect(toAssetSnapshots(raw)).toHaveLength(0);
  });
});

describe("REST client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchAssetSnapshots posts the right request type and parses the response", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () =>
        [
          { universe: [{ name: "ETH", szDecimals: 4, maxLeverage: 50 }] },
          [
            {
              funding: "0.00001",
              openInterest: "500",
              prevDayPx: "3000",
              dayNtlVlm: "1000000",
              premium: "0",
              oraclePx: "3010",
              markPx: "3005",
              midPx: "3005",
              dayBaseVlm: "300",
            },
          ],
        ] as MetaAndAssetCtxs,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const snapshots = await fetchAssetSnapshots();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/info");
    expect(JSON.parse(String(opts?.body))).toEqual({ type: "metaAndAssetCtxs" });
    expect(snapshots).toEqual([
      expect.objectContaining({ coin: "ETH", markPx: 3005, oraclePx: 3010 }),
    ]);
  });

  it("throws with status context on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, text: async () => "unavailable" })),
    );
    await expect(getAllMids()).rejects.toThrow(/503/);
  });
});
