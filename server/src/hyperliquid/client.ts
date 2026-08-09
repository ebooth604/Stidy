import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type {
  AllMids,
  AssetSnapshot,
  Candle,
  FundingHistoryEntry,
  L2Book,
  MetaAndAssetCtxs,
  PredictedFunding,
} from "./types.js";

/** Thin client over Hyperliquid's public POST /info endpoint.
 * All of these are read-only market-data calls — no wallet/signing needed,
 * which is why paper trading needs zero secrets to run.
 */

class HyperliquidRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "HyperliquidRequestError";
  }
}

async function info<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${config.hyperliquid.apiUrl}/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HyperliquidRequestError(
      `Hyperliquid /info ${JSON.stringify(body.type)} failed: ${res.status} ${text}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

export async function getMetaAndAssetCtxs(): Promise<MetaAndAssetCtxs> {
  return info<MetaAndAssetCtxs>({ type: "metaAndAssetCtxs" });
}

export async function getAllMids(): Promise<AllMids> {
  return info<AllMids>({ type: "allMids" });
}

export async function getL2Book(coin: string): Promise<L2Book> {
  return info<L2Book>({ type: "l2Book", coin });
}

export async function getFundingHistory(
  coin: string,
  startTime: number,
  endTime?: number,
): Promise<FundingHistoryEntry[]> {
  return info<FundingHistoryEntry[]>({ type: "fundingHistory", coin, startTime, endTime });
}

export async function getPredictedFundings(): Promise<PredictedFunding[]> {
  return info<PredictedFunding[]>({ type: "predictedFundings" });
}

export async function getCandleSnapshot(
  coin: string,
  interval: string,
  startTime: number,
  endTime: number,
): Promise<Candle[]> {
  return info<Candle[]>({
    type: "candleSnapshot",
    req: { coin, interval, startTime, endTime },
  });
}

/** Flattens metaAndAssetCtxs into per-asset numeric snapshots for signal math. */
export function toAssetSnapshots([meta, ctxs]: MetaAndAssetCtxs): AssetSnapshot[] {
  const snapshots: AssetSnapshot[] = [];
  for (let i = 0; i < meta.universe.length; i++) {
    const asset = meta.universe[i];
    const ctx = ctxs[i];
    if (!asset || !ctx) continue;
    const markPx = Number(ctx.markPx);
    const oraclePx = Number(ctx.oraclePx);
    if (!Number.isFinite(markPx) || !Number.isFinite(oraclePx) || oraclePx === 0) continue;
    snapshots.push({
      coin: asset.name,
      markPx,
      oraclePx,
      midPx: ctx.midPx ? Number(ctx.midPx) : null,
      fundingHourly: Number(ctx.funding) || 0,
      openInterest: Number(ctx.openInterest) || 0,
      dayNtlVlm: Number(ctx.dayNtlVlm) || 0,
      prevDayPx: Number(ctx.prevDayPx) || 0,
    });
  }
  return snapshots;
}

export async function fetchAssetSnapshots(): Promise<AssetSnapshot[]> {
  try {
    const raw = await getMetaAndAssetCtxs();
    return toAssetSnapshots(raw);
  } catch (err) {
    logger.error({ err }, "[hyperliquid] failed to fetch asset snapshots");
    throw err;
  }
}

export { HyperliquidRequestError };
