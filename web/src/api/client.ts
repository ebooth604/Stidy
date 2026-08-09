import type {
  BotDesign,
  BotSummary,
  ChatTurn,
  HealthResponse,
  LiveAccountState,
  PortfolioResponse,
  Position,
  SignalsResponse,
  StoredDigest,
  Trade,
  TuningSuggestion,
} from "../types";

const BASE = "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error ?? `Request failed: ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>("/health"),

  signals: () => request<SignalsResponse>("/signals"),

  bots: {
    list: () => request<BotSummary[]>("/bots"),
    get: (id: string) =>
      request<
        BotSummary & {
          openPositions: Position[];
          recentTrades: Trade[];
          openLivePositions: Position[];
          recentLiveTrades: Trade[];
        }
      >(`/bots/${id}`),
    create: (body: {
      name: string;
      strategy: string;
      config?: Partial<BotSummary["config"]>;
      pollIntervalSeconds?: number;
      enabled?: boolean;
    }) => request<BotSummary>("/bots", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Partial<{ name: string; config: Partial<BotSummary["config"]>; pollIntervalSeconds: number; enabled: boolean }>) =>
      request<BotSummary>(`/bots/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) => request<void>(`/bots/${id}`, { method: "DELETE" }),
  },

  positions: {
    close: (id: string) => request<{ closed: boolean }>(`/positions/${id}/close`, { method: "POST" }),
  },

  portfolio: () => request<PortfolioResponse>("/portfolio"),
  trades: (limit = 50) => request<Trade[]>(`/trades?limit=${limit}`),

  live: {
    account: () => request<LiveAccountState>("/live/account"),
    positions: () => request<Position[]>("/live/positions"),
    trades: (limit = 50) => request<Trade[]>(`/live/trades?limit=${limit}`),
    closePosition: (id: string) => request<{ closed: boolean }>(`/live-positions/${id}/close`, { method: "POST" }),
  },

  ai: {
    digest: () => request<StoredDigest>("/ai/digest"),
    refreshDigest: () => request<StoredDigest>("/ai/digest/refresh", { method: "POST" }),
    tuneBot: (botId: string) =>
      request<{ suggestion: TuningSuggestion; stats: unknown }>(`/ai/bots/${botId}/tune`, { method: "POST" }),
    designBot: (body: { riskAppetite: "low" | "medium" | "high"; capitalUsd: number }) =>
      request<BotDesign>("/ai/bots/design", { method: "POST", body: JSON.stringify(body) }),
    chat: (messages: ChatTurn[]) => request<{ reply: string }>("/ai/chat", { method: "POST", body: JSON.stringify({ messages }) }),
  },
};
