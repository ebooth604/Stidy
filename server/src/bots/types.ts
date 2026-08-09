export type StrategyName = "basis_reversion" | "funding_reversion" | "cmc_basis_reversion";

export const STRATEGY_NAMES: StrategyName[] = [
  "basis_reversion",
  "funding_reversion",
  "cmc_basis_reversion",
];

/** User-tunable knobs for a bot instance. Same shape across strategies so the
 * AI tuner and the "design a bot" flow can reason about them generically.
 */
export interface BotConfig {
  /** Minimum signal magnitude (basis gap % or funding APR %) required to act. */
  minSignalValue: number;
  stopLossPct: number;
  takeProfitPct: number;
  positionSizeUsd: number;
  maxPositions: number;
  /** Pause new entries (stops still fire) once drawdown from peak balance exceeds this. 0 disables the gate. */
  maxDrawdownPct: number;
  /** Real-money trading for THIS bot. Only takes effect if the server has live
   * trading configured at all (HYPERLIQUID_LIVE_TRADING_ENABLED + credentials) —
   * otherwise this flag is inert. Always false by default. */
  liveTrading: boolean;
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
  minSignalValue: 0.2,
  stopLossPct: 1.5,
  takeProfitPct: 1,
  positionSizeUsd: 500,
  maxPositions: 5,
  maxDrawdownPct: 20,
  liveTrading: false,
};

export interface TradeIntent {
  coin: string;
  side: "long" | "short";
  entryPrice: number;
  signalId: string;
  signalValue: number;
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
