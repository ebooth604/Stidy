import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

export function isCmcConfigured(): boolean {
  return Boolean(config.cmc.apiKey);
}

/** Hyperliquid denotes some low-priced tokens with a "k" prefix meaning
 * "position size is in thousands of units" (kPEPE, kSHIB, kBONK, kFLOKI,
 * kDOGS, kNEIRO) — those aren't real CMC tickers, so map them back to the
 * underlying asset. Anything else passes through unchanged.
 */
const K_PREFIX_MAP: Record<string, string> = {
  kPEPE: "PEPE",
  kSHIB: "SHIB",
  kBONK: "BONK",
  kFLOKI: "FLOKI",
  kDOGS: "DOGS",
  kNEIRO: "NEIRO",
  kLUNC: "LUNC",
};

export function toCmcSymbol(hyperliquidCoin: string): string {
  return K_PREFIX_MAP[hyperliquidCoin] ?? hyperliquidCoin;
}

interface CmcQuoteEntry {
  symbol: string;
  cmc_rank?: number;
  is_active?: number;
  quote: { USD: { price: number } };
}

type CmcQuotesResponse = {
  data: Record<string, CmcQuoteEntry[] | CmcQuoteEntry>;
};

/** Fetches USD spot prices for a batch of tickers from CMC's v2 quotes
 * endpoint. Returns a map keyed by the ORIGINAL symbols passed in (already
 * deduped/normalized by the caller) so callers don't need to know about the
 * k-prefix mapping. Symbols CMC doesn't recognize are simply absent from the result.
 */
export async function getSpotPrices(symbols: string[]): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};
  if (!config.cmc.apiKey) throw new Error("CMC_API_KEY is not configured");

  const url = new URL("/v2/cryptocurrency/quotes/latest", config.cmc.baseUrl);
  url.searchParams.set("symbol", symbols.join(","));
  url.searchParams.set("convert", "USD");

  const res = await fetch(url, {
    headers: { "X-CMC_PRO_API_KEY": config.cmc.apiKey, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CoinMarketCap quotes request failed: ${res.status} ${text}`);
  }

  const body = (await res.json()) as CmcQuotesResponse;
  const prices: Record<string, number> = {};

  for (const [symbol, entryOrArray] of Object.entries(body.data)) {
    const entries = Array.isArray(entryOrArray) ? entryOrArray : [entryOrArray];
    // v2 can return multiple coins sharing a ticker — prefer the active, lowest-rank one.
    const best = [...entries].sort((a, b) => {
      if ((a.is_active ?? 1) !== (b.is_active ?? 1)) return (b.is_active ?? 1) - (a.is_active ?? 1);
      return (a.cmc_rank ?? Infinity) - (b.cmc_rank ?? Infinity);
    })[0];
    const price = best?.quote?.USD?.price;
    if (typeof price === "number" && Number.isFinite(price)) prices[symbol] = price;
  }

  return prices;
}

export async function getSpotPricesSafe(symbols: string[]): Promise<Record<string, number>> {
  try {
    return await getSpotPrices(symbols);
  } catch (err) {
    logger.warn({ err }, "[cmc] spot price fetch failed");
    return {};
  }
}
