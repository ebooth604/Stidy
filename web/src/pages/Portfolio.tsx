import { api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { EquityChart } from "../components/EquityChart";
import { LiveBadge } from "../components/LiveBadge";
import { PositionTable } from "../components/PositionTable";
import { StatCard } from "../components/StatCard";
import { TradeTable } from "../components/TradeTable";
import { usePolling } from "../hooks/usePolling";

export function Portfolio() {
  const portfolio = usePolling(api.portfolio, 10_000);
  const trades = usePolling(() => api.trades(100), 15_000);

  async function handleClose(id: string) {
    await api.positions.close(id);
    portfolio.refresh();
  }

  const account = portfolio.data?.account;
  const totalPnl = account ? account.balance - 100_000 : 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Portfolio</h1>

      <LiveAccountPanel />

      <h2 className="text-sm font-semibold text-slate-300">Paper account</h2>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Balance" value={account ? `$${account.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"} />
        <StatCard
          label="All-time P&L"
          value={account ? `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}` : "—"}
          tone={totalPnl > 0 ? "positive" : totalPnl < 0 ? "negative" : "neutral"}
        />
        <StatCard label="Trade count" value={account ? String(account.tradeCount) : "—"} />
        <StatCard label="Consecutive losses" value={account ? String(account.consecutiveLosses) : "—"} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-300">Equity curve (cumulative realized P&amp;L)</h2>
        <EquityChart trades={trades.data ?? []} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-300">Open positions</h2>
        <PositionTable positions={portfolio.data?.openPositions ?? []} onClose={handleClose} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-300">Trade history</h2>
        <TradeTable trades={trades.data ?? []} />
      </section>
    </div>
  );
}

function LiveAccountPanel() {
  const health = usePolling(api.health, 30_000);
  const account = usePolling(api.live.account, 10_000);
  const positions = usePolling(api.live.positions, 10_000);
  const trades = usePolling(() => api.live.trades(50), 15_000);

  async function handleClose(id: string) {
    if (!confirm("Close this LIVE position with a real market order?")) return;
    await api.live.closePosition(id);
    positions.refresh();
    account.refresh();
  }

  if (health.data && !health.data.liveTradingConfigured) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
          Live account <LiveBadge />
        </h2>
        <EmptyState message="Live trading is not configured on this server — this app only paper trades until HYPERLIQUID_LIVE_TRADING_ENABLED, an API wallet key, and an account address are set." />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-short/30 bg-short/5 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
        Live account <LiveBadge /> <span className="text-xs font-normal text-slate-500">— real funds, real orders</span>
      </h2>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Account value" value={account.data ? `$${account.data.accountValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"} />
        <StatCard label="Withdrawable" value={account.data ? `$${account.data.withdrawable.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"} />
        <StatCard label="Margin used" value={account.data ? `$${account.data.totalMarginUsed.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"} />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Open live positions</h3>
        <PositionTable positions={positions.data ?? []} onClose={handleClose} />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Live trade history</h3>
        <TradeTable trades={trades.data ?? []} />
      </div>
    </section>
  );
}
