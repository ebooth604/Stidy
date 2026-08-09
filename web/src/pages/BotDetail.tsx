import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { BotForm, type BotFormValues } from "../components/BotForm";
import { EmptyState } from "../components/EmptyState";
import { PositionTable } from "../components/PositionTable";
import { TradeTable } from "../components/TradeTable";
import { usePolling } from "../hooks/usePolling";
import type { TuningSuggestion } from "../types";

export function BotDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: bot, refresh } = usePolling(() => api.bots.get(id!), 10_000, [id]);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tuning, setTuning] = useState<{ suggestion: TuningSuggestion } | null>(null);
  const [tuningLoading, setTuningLoading] = useState(false);
  const [tuningError, setTuningError] = useState<string | null>(null);

  if (!id) return null;
  if (!bot) return <EmptyState message="Loading…" />;

  async function handleSave(values: BotFormValues) {
    setSaving(true);
    setError(null);
    try {
      await api.bots.update(id!, values);
      setEditing(false);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save bot");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle() {
    await api.bots.update(id!, { enabled: !bot!.enabled });
    refresh();
  }

  async function handleDelete() {
    if (!confirm(`Delete bot "${bot!.name}"? This cannot be undone.`)) return;
    try {
      await api.bots.remove(id!);
      navigate("/bots");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete bot (does it have open positions?)");
    }
  }

  async function handleClosePosition(positionId: string) {
    await api.positions.close(positionId);
    refresh();
  }

  async function handleTune() {
    setTuningLoading(true);
    setTuningError(null);
    try {
      const result = await api.ai.tuneBot(id!);
      setTuning(result);
    } catch (err) {
      setTuningError(err instanceof ApiError ? err.message : "Tuning request failed");
    } finally {
      setTuningLoading(false);
    }
  }

  async function applySuggestion() {
    if (!tuning) return;
    await api.bots.update(id!, { config: tuning.suggestion.suggestedConfig });
    setTuning(null);
    refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{bot.name}</h1>
          <div className="text-sm text-slate-500">{bot.strategy.replace(/_/g, " ")}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleToggle} className="rounded border border-border px-3 py-2 text-sm hover:bg-white/5">
            {bot.enabled ? "Disable" : "Enable"}
          </button>
          <button onClick={() => setEditing((v) => !v)} className="rounded border border-border px-3 py-2 text-sm hover:bg-white/5">
            {editing ? "Cancel edit" : "Edit config"}
          </button>
          <button onClick={handleDelete} className="rounded border border-short/40 px-3 py-2 text-sm text-short hover:bg-short/10">
            Delete
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-short">{error}</div>}

      {editing && (
        <div className="rounded-lg border border-border bg-panel p-5">
          <BotForm
            initial={{ name: bot.name, strategy: bot.strategy, config: bot.config, pollIntervalSeconds: bot.pollIntervalSeconds, enabled: bot.enabled }}
            submitLabel="Save changes"
            onSubmit={handleSave}
            submitting={saving}
          />
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <Stat label="Open positions" value={`${bot.openPositions}/${bot.config.maxPositions}`} />
        <Stat label="Total trades" value={String(bot.totalTrades)} />
        <Stat label="Win rate" value={bot.winRate !== null ? `${bot.winRate}%` : "—"} />
        <Stat label="Total P&L" value={`${bot.totalPnl >= 0 ? "+" : ""}$${bot.totalPnl.toFixed(2)}`} tone={bot.totalPnl >= 0 ? "positive" : "negative"} />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">AI tuning suggestion</h2>
          <button
            onClick={handleTune}
            disabled={tuningLoading}
            className="rounded border border-accent/40 px-3 py-1.5 text-xs text-accent hover:bg-accent/10 disabled:opacity-50"
          >
            {tuningLoading ? "Analyzing…" : "Analyze performance"}
          </button>
        </div>
        {tuningError && <div className="text-sm text-short">{tuningError}</div>}
        {tuning && (
          <div className="rounded-lg border border-accent/30 bg-panel p-4">
            <p className="text-sm text-slate-300">{tuning.suggestion.rationale}</p>
            <pre className="mt-3 overflow-x-auto rounded bg-bg p-3 text-xs text-slate-400">
              {JSON.stringify(tuning.suggestion.suggestedConfig, null, 2)}
            </pre>
            <button onClick={applySuggestion} className="mt-3 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90">
              Apply to bot
            </button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-300">Open positions</h2>
        <PositionTable positions={bot.openPositions} onClose={handleClosePosition} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-300">Recent trades</h2>
        <TradeTable trades={bot.recentTrades} />
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  const color = tone === "positive" ? "text-long" : tone === "negative" ? "text-short" : "text-slate-100";
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
