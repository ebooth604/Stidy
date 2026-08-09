import type { WsTrade } from "../hyperliquid/types.js";
import { makeSignalId, type Signal } from "./types.js";

const ROLLING_WINDOW_MS = 15 * 60 * 1000;

interface TrackedTrade {
  coin: string;
  side: "buy" | "sell";
  notionalUsd: number;
  time: number;
}

/** Watches the live trades feed for single prints above `thresholdUsd` and
 * keeps a rolling buy/sell notional imbalance per coin so the digest can say
 * "net $4.2M bought on HYPE in the last 15m" rather than just listing prints.
 */
export class WhaleTradeTracker {
  private recent: TrackedTrade[] = [];

  constructor(private thresholdUsd: number) {}

  /** Ingests a WS trade batch; returns newly-fired whale signals (one per print). */
  ingest(trades: WsTrade[]): Signal[] {
    const now = Date.now();
    const fired: Signal[] = [];

    for (const t of trades) {
      const px = Number(t.px);
      const sz = Number(t.sz);
      if (!Number.isFinite(px) || !Number.isFinite(sz)) continue;
      const notionalUsd = px * sz;
      const side: "buy" | "sell" = t.side === "B" ? "buy" : "sell";
      const time = t.time || now;

      this.recent.push({ coin: t.coin, side, notionalUsd, time });

      if (notionalUsd >= this.thresholdUsd) {
        fired.push({
          id: makeSignalId("whale_trade", t.coin),
          type: "whale_trade",
          coin: t.coin,
          value: notionalUsd,
          direction: side === "buy" ? "long" : "short",
          context: { side, notionalUsd: Math.round(notionalUsd), px, sz },
          createdAt: time,
        });
      }
    }

    this.prune(now);
    return fired;
  }

  private prune(now: number): void {
    const cutoff = now - ROLLING_WINDOW_MS;
    if (this.recent.length > 5000 || (this.recent[0]?.time ?? now) < cutoff) {
      this.recent = this.recent.filter((t) => t.time >= cutoff);
    }
  }

  /** Net buy/sell notional per coin over the trailing 15 minutes. */
  getImbalances(): { coin: string; netUsd: number; buyUsd: number; sellUsd: number }[] {
    const byCoin = new Map<string, { buyUsd: number; sellUsd: number }>();
    for (const t of this.recent) {
      const entry = byCoin.get(t.coin) ?? { buyUsd: 0, sellUsd: 0 };
      if (t.side === "buy") entry.buyUsd += t.notionalUsd;
      else entry.sellUsd += t.notionalUsd;
      byCoin.set(t.coin, entry);
    }
    return [...byCoin.entries()]
      .map(([coin, { buyUsd, sellUsd }]) => ({
        coin,
        netUsd: buyUsd - sellUsd,
        buyUsd,
        sellUsd,
      }))
      .sort((a, b) => Math.abs(b.netUsd) - Math.abs(a.netUsd));
  }
}
