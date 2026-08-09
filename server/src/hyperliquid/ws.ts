import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type { AllMids, WsTrade } from "./types.js";

interface HyperliquidWsEvents {
  open: [];
  close: [];
  trade: [WsTrade[]];
  allMids: [AllMids];
}

/** Reconnecting WS client over Hyperliquid's public feed.
 * Tracks which coins have an active "trades" subscription so a reconnect
 * can silently resubscribe everything without callers noticing the drop.
 */
export class HyperliquidWsClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;
  private subscribedTradeCoins = new Set<string>();
  private allMidsSubscribed = false;

  connect(): void {
    this.closedByUser = false;
    this.open();
  }

  private open(): void {
    const ws = new WebSocket(config.hyperliquid.wsUrl);
    this.ws = ws;

    ws.on("open", () => {
      this.reconnectAttempt = 0;
      logger.info("[hyperliquid-ws] connected");
      if (this.allMidsSubscribed) this.send({ type: "allMids" });
      for (const coin of this.subscribedTradeCoins) this.send({ type: "trades", coin });
      this.emit("open");
    });

    ws.on("message", (raw) => {
      this.handleMessage(raw.toString());
    });

    ws.on("close", () => {
      this.emit("close");
      if (!this.closedByUser) this.scheduleReconnect();
    });

    ws.on("error", (err) => {
      logger.warn({ err }, "[hyperliquid-ws] socket error");
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delayMs = Math.min(30_000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt++;
    logger.warn({ delayMs }, "[hyperliquid-ws] reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delayMs);
  }

  private send(
    subscription: Record<string, unknown>,
    method: "subscribe" | "unsubscribe" = "subscribe",
  ): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ method, subscription }));
  }

  private handleMessage(raw: string): void {
    let parsed: { channel?: string; data?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (parsed.channel === "trades") {
      this.emit("trade", parsed.data as WsTrade[]);
    } else if (parsed.channel === "allMids") {
      const payload = parsed.data as { mids?: AllMids } | AllMids;
      const mids = "mids" in (payload as object) ? (payload as { mids: AllMids }).mids : (payload as AllMids);
      this.emit("allMids", mids);
    }
  }

  subscribeAllMids(): void {
    this.allMidsSubscribed = true;
    this.send({ type: "allMids" });
  }

  /** Reconciles the live "trades" subscriptions to exactly `coins`. */
  syncTradeSubscriptions(coins: string[]): void {
    const next = new Set(coins);
    for (const coin of next) {
      if (!this.subscribedTradeCoins.has(coin)) this.send({ type: "trades", coin });
    }
    for (const coin of this.subscribedTradeCoins) {
      if (!next.has(coin)) this.send({ type: "trades", coin }, "unsubscribe");
    }
    this.subscribedTradeCoins = next;
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}

export interface HyperliquidWsClient {
  on<K extends keyof HyperliquidWsEvents>(
    event: K,
    listener: (...args: HyperliquidWsEvents[K]) => void,
  ): this;
  emit<K extends keyof HyperliquidWsEvents>(event: K, ...args: HyperliquidWsEvents[K]): boolean;
}
