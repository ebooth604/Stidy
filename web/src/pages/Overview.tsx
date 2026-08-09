import { Link } from "react-router-dom";
import { api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { StatCard } from "../components/StatCard";
import { usePolling } from "../hooks/usePolling";

export function Overview() {
  const portfolio = usePolling(api.portfolio, 10_000);
  const signals = usePolling(api.signals, 15_000);
  const bots = usePolling(api.bots.list, 15_000);

  const account = portfolio.data?.account;
  const totalPnl = account ? account.balance - 100_000 : 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Overview</h1>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Paper balance" value={account ? `$${account.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"} />
        <StatCard
          label="All-time P&L"
          value={account ? `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
          tone={totalPnl > 0 ? "positive" : totalPnl < 0 ? "negative" : "neutral"}
        />
        <StatCard label="Drawdown from peak" value={portfolio.data ? `${portfolio.data.drawdownPct}%` : "—"} tone={portfolio.data && portfolio.data.drawdownPct > 0 ? "negative" : "neutral"} />
        <StatCard label="Open positions" value={portfolio.data ? String(portfolio.data.openPositions.length) : "—"} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Top basis gaps</h2>
            <Link to="/signals" className="text-xs text-accent hover:underline">View all →</Link>
          </div>
          {signals.data && signals.data.basis.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {signals.data.basis.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded border border-border bg-panel px-3 py-2 text-sm">
                  <span className="font-medium">{s.coin}</span>
                  <span className={s.direction === "long" ? "text-long" : "text-short"}>
                    {s.direction} · {s.value.toFixed(2)}%
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="No basis gaps above threshold right now." />
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Funding extremes</h2>
            <Link to="/signals" className="text-xs text-accent hover:underline">View all →</Link>
          </div>
          {signals.data && signals.data.funding.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {signals.data.funding.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded border border-border bg-panel px-3 py-2 text-sm">
                  <span className="font-medium">{s.coin}</span>
                  <span className={s.direction === "long" ? "text-long" : "text-short"}>
                    {s.direction} · {s.value.toFixed(1)}% APR
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="No funding extremes above threshold right now." />
          )}
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">Bots</h2>
          <Link to="/bots" className="text-xs text-accent hover:underline">Manage →</Link>
        </div>
        {bots.data && bots.data.length > 0 ? (
          <div className="grid grid-cols-3 gap-4">
            {bots.data.map((b) => (
              <Link key={b.id} to={`/bots/${b.id}`} className="rounded-lg border border-border bg-panel p-4 hover:border-accent/50">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{b.name}</span>
                  <span className={`text-xs ${b.enabled ? "text-long" : "text-slate-500"}`}>{b.enabled ? "enabled" : "disabled"}</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">{b.strategy.replace("_", " ")}</div>
                <div className="mt-3 flex justify-between text-sm">
                  <span>{b.openPositions} open</span>
                  <span className={b.totalPnl >= 0 ? "text-long" : "text-short"}>${b.totalPnl.toFixed(2)}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState message="No bots yet. Create one to start paper trading against live signals." />
        )}
      </section>
    </div>
  );
}
