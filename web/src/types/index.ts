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

export interface TuningSuggestion {
  rationale: string;
  suggestedConfig: BotConfig;
}

export interface BotDesign {
  name: string;
  strategy: StrategyName;
  rationale: string;
  config: BotConfig;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
