import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { BotForm, type BotFormValues } from "../components/BotForm";
import { EmptyState } from "../components/EmptyState";
import { LiveBadge } from "../components/LiveBadge";
import { usePolling } from "../hooks/usePolling";

export function Bots() {
  const { data: bots, refresh } = usePolling(api.bots.list, 15_000);
  const health = usePolling(api.health, 30_000);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleCreate(values: BotFormValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      const bot = await api.bots.create(values);
      setShowForm(false);
      refresh();
      navigate(`/bots/${bot.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create bot");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Bots</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          {showForm ? "Cancel" : "New bot"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border bg-panel p-5">
          {formError && <div className="mb-3 text-sm text-short">{formError}</div>}
          <BotForm
            submitLabel="Create bot"
            onSubmit={handleCreate}
            submitting={submitting}
            liveTradingConfigured={health.data?.liveTradingConfigured ?? false}
          />
        </div>
      )}

      {bots && bots.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Strategy</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Open</th>
                <th className="px-3 py-2">Trades</th>
                <th className="px-3 py-2">Win rate</th>
                <th className="px-3 py-2">Total P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {bots.map((b) => (
                <tr key={b.id} className="border-t border-border/60 hover:bg-white/5">
                  <td className="px-3 py-2">
                    <Link to={`/bots/${b.id}`} className="font-medium text-accent hover:underline">
                      {b.name}
                    </Link>
                    {b.config.liveTrading && (
                      <span className="ml-2 align-middle">
                        <LiveBadge />
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{b.strategy.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2">
                    <span className={b.enabled ? "text-long" : "text-slate-500"}>{b.enabled ? "enabled" : "disabled"}</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {b.openPositions}/{b.config.maxPositions}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{b.totalTrades}</td>
                  <td className="px-3 py-2 tabular-nums">{b.winRate !== null ? `${b.winRate}%` : "—"}</td>
                  <td className={`px-3 py-2 tabular-nums font-medium ${b.totalPnl >= 0 ? "text-long" : "text-short"}`}>
                    {b.totalPnl >= 0 ? "+" : ""}${b.totalPnl.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !showForm && <EmptyState message="No bots yet. Create one to start paper trading against live signals." />
      )}
    </div>
  );
}
