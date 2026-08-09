/** Circuit breaker: refuses new entries once drawdown from the peak balance
 * exceeds the configured threshold. Open positions still get their stop-loss
 * / take-profit checked regardless — this only gates *new* risk.
 */
export function passesDrawdownGate(
  maxDrawdownPct: number,
  peakBalance: number,
  currentBalance: number,
): boolean {
  if (maxDrawdownPct <= 0) return true;
  if (peakBalance <= 0) return true;
  const drawdownPct = ((peakBalance - currentBalance) / peakBalance) * 100;
  return drawdownPct < maxDrawdownPct;
}

export function currentDrawdownPct(peakBalance: number, currentBalance: number): number {
  if (peakBalance <= 0) return 0;
  return ((peakBalance - currentBalance) / peakBalance) * 100;
}

export function computePnl(
  side: "long" | "short",
  quantity: number,
  entryPrice: number,
  currentPrice: number,
): { pnl: number; pnlPct: number } {
  const pnl =
    side === "long"
      ? (currentPrice - entryPrice) * quantity
      : (entryPrice - currentPrice) * quantity;
  const pnlPct =
    side === "long"
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;
  return { pnl: round2(pnl), pnlPct: round2(pnlPct) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
