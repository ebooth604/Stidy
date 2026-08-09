import { api } from "../api/client";
import { EquityChart } from "../components/EquityChart";
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
