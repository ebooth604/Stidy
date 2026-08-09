/** Shapes returned by Hyperliquid's public /info endpoint and WS feed.
 * Reference: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
 */

export interface PerpUniverseAsset {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated?: boolean;
}

export interface PerpMeta {
  universe: PerpUniverseAsset[];
}

/** Per-asset market context, index-aligned with PerpMeta.universe. */
export interface AssetCtx {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string | null;
  oraclePx: string;
  markPx: string;
  midPx: string | null;
  dayBaseVlm: string;
}

export type MetaAndAssetCtxs = [PerpMeta, AssetCtx[]];

export type AllMids = Record<string, string>;

export interface L2Level {
  px: string;
  sz: string;
  n: number;
}

export interface L2Book {
  coin: string;
  time: number;
  levels: [L2Level[], L2Level[]];
}

export interface FundingHistoryEntry {
  coin: string;
  fundingRate: string;
  premium: string;
  time: number;
}

export interface PredictedFundingVenue {
  fundingRate: string;
  nextFundingTime: number;
}

/** [coin, [[venueName, {fundingRate, nextFundingTime} | null], ...]] */
export type PredictedFunding = [string, [string, PredictedFundingVenue | null][]];

export interface Candle {
  t: number;
  T: number;
  s: string;
  i: string;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n: number;
}

export interface WsTrade {
  coin: string;
  side: "A" | "B"; // A = sell (ask taker), B = buy (bid taker)
  px: string;
  sz: string;
  hash: string;
  time: number;
  tid: number;
  users: [string, string];
}

/** Normalized snapshot of a single perp asset's market state, ready for signal math. */
export interface AssetSnapshot {
  coin: string;
  markPx: number;
  oraclePx: number;
  midPx: number | null;
  fundingHourly: number;
  openInterest: number;
  dayNtlVlm: number;
  prevDayPx: number;
}
