export type SignalType = "basis" | "funding" | "whale_trade" | "cmc_basis";
export type Direction = "long" | "short" | "neutral";

export interface Signal {
  id: string;
  type: SignalType;
  coin: string;
  value: number;
  direction: Direction;
  context: Record<string, unknown>;
  createdAt: number;
}

export interface WhaleImbalance {
  coin: string;
  netUsd: number;
  buyUsd: number;
  sellUsd: number;
}

export interface SignalsResponse {
  basis: Signal[];
  funding: Signal[];
  whaleTrades: Signal[];
  cmcBasis: Signal[];
  cmcConfigured: boolean;
  whaleImbalances: WhaleImbalance[];
}

export type StrategyName = "basis_reversion" | "funding_reversion" | "cmc_basis_reversion";

export interface BotConfig {
  minSignalValue: number;
  stopLossPct: number;
  takeProfitPct: number;
  positionSizeUsd: number;
  maxPositions: number;
  maxDrawdownPct: number;
  /** Real-money trading for this bot. Inert unless the server has live trading configured. */
  liveTrading: boolean;
}

export interface BotSummary {
  id: string;
  name: string;
  strategy: StrategyName;
  enabled: boolean;
  config: BotConfig;
  pollIntervalSeconds: number;
  lastRunAt: number | null;
  createdAt: number;
  updatedAt: number;
  openPositions: number;
  totalTrades: number;
  totalPnl: number;
  winRate: number | null;
  openLivePositions: number;
  totalLiveTrades: number;
  totalLivePnl: number;
}

export interface Position {
  id: string;
  botId: string;
  botName?: string;
  coin: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  status: "open" | "closed" | "stopped";
  pnl: number | null;
  pnlPct: number | null;
  closedPrice: number | null;
  openedAt: string;
  closedAt: string | null;
}

export interface Trade {
  id: string;
  botId: string;
  botName?: string;
  positionId: string;
  coin: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  closeReason: "stop_loss" | "take_profit" | "manual";
  pnl: number;
  pnlPct: number;
  openedAt: string;
  closedAt: string;
}

export interface PaperAccount {
  id: string;
  balance: number;
  peakBalance: number;
  tradeCount: number;
  consecutiveLosses: number;
  updatedAt: string;
}

export interface PortfolioResponse {
  account: PaperAccount;
  drawdownPct: number;
  openPositions: Position[];
}

export interface DigestItem {
  coin: string;
  signalType: SignalType | "combined";
  bias: Direction;
  confidence: "low" | "medium" | "high";
  rationale: string;
}

export interface Digest {
  summary: string;
  items: DigestItem[];
}

export interface StoredDigest {
  digest: Digest;
  generatedAt: number;
}

/** The AI never controls liveTrading — its output structurally can't include
 * that field (see server/src/ai/schemas.ts), so it's omitted here too. */
export type AiBotConfig = Omit<BotConfig, "liveTrading">;

export interface TuningSuggestion {
  rationale: string;
  suggestedConfig: AiBotConfig;
}

export interface BotDesign {
  name: string;
  strategy: StrategyName;
  rationale: string;
  config: AiBotConfig;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface HealthResponse {
  status: string;
  aiConfigured: boolean;
  cmcConfigured: boolean;
  liveTradingConfigured: boolean;
  time: string;
}

export interface LiveAccountPosition {
  coin: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  unrealizedPnl: number;
  liquidationPx: number | null;
}

export interface LiveAccountState {
  accountValue: number;
  withdrawable: number;
  totalMarginUsed: number;
  positions: LiveAccountPosition[];
}
