import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { DirectionBadge } from "../components/DirectionBadge";
import { EmptyState } from "../components/EmptyState";
import { usePolling } from "../hooks/usePolling";
import type { BotDesign, ChatTurn } from "../types";

export function AIInsights() {
  const health = usePolling(api.health, 30_000);
  const digest = usePolling(api.ai.digest, 60_000);
  const [refreshing, setRefreshing] = useState(false);
  const [digestError, setDigestError] = useState<string | null>(null);

  async function refreshDigest() {
    setRefreshing(true);
    setDigestError(null);
    try {
      await api.ai.refreshDigest();
      digest.refresh();
    } catch (err) {
      setDigestError(err instanceof ApiError ? err.message : "Failed to refresh digest");
    } finally {
      setRefreshing(false);
    }
  }

  if (health.data && !health.data.aiConfigured) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">AI Insights</h1>
        <EmptyState message="ANTHROPIC_API_KEY is not configured on the server — set it to enable the market digest, bot tuning, and chat assistant." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">AI Insights</h1>
        <button
          onClick={refreshDigest}
          disabled={refreshing}
          className="rounded border border-accent/40 px-3 py-1.5 text-xs text-accent hover:bg-accent/10 disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh digest"}
        </button>
      </div>

      {digestError && <div className="text-sm text-short">{digestError}</div>}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-300">Market digest</h2>
        {digest.data ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-lg border border-border bg-panel p-4 text-sm text-slate-300">{digest.data.digest.summary}</p>
            <div className="grid grid-cols-2 gap-3">
              {digest.data.digest.items.map((item, i) => (
                <div key={i} className="rounded-lg border border-border bg-panel p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{item.coin}</span>
                    <DirectionBadge direction={item.bias} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.signalType.replace(/_/g, " ")} · {item.confidence} confidence
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{item.rationale}</p>
                </div>
              ))}
            </div>
            <div className="text-xs text-slate-600">Generated {new Date(digest.data.generatedAt).toLocaleString()}</div>
          </div>
        ) : (
          <EmptyState message={digest.loading ? "Generating digest…" : "No digest yet."} />
        )}
      </section>

      <BotDesigner />
      <ChatPanel />
    </div>
  );
}

function BotDesigner() {
  const navigate = useNavigate();
  const [riskAppetite, setRiskAppetite] = useState<"low" | "medium" | "high">("medium");
  const [capitalUsd, setCapitalUsd] = useState(5000);
  const [design, setDesign] = useState<BotDesign | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleDesign() {
    setLoading(true);
    setError(null);
    setDesign(null);
    try {
      const result = await api.ai.designBot({ riskAppetite, capitalUsd });
      setDesign(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to design a bot");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!design) return;
    setCreating(true);
    try {
      const bot = await api.bots.create({ name: design.name, strategy: design.strategy, config: design.config, enabled: false });
      navigate(`/bots/${bot.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create bot from design");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-slate-300">Design a bot</h2>
      <div className="flex items-end gap-3 rounded-lg border border-border bg-panel p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">Risk appetite</span>
          <select
            value={riskAppetite}
            onChange={(e) => setRiskAppetite(e.target.value as typeof riskAppetite)}
            className="rounded border border-border bg-bg px-3 py-2"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">Capital ($)</span>
          <input
            type="number"
            value={capitalUsd}
            onChange={(e) => setCapitalUsd(Number(e.target.value))}
            className="rounded border border-border bg-bg px-3 py-2"
          />
        </label>
        <button
          onClick={handleDesign}
          disabled={loading}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {loading ? "Designing…" : "Design bot"}
        </button>
      </div>

      {error && <div className="text-sm text-short">{error}</div>}

      {design && (
        <div className="rounded-lg border border-accent/30 bg-panel p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">{design.name}</span>
            <span className="text-xs text-slate-500">{design.strategy.replace(/_/g, " ")}</span>
          </div>
          <p className="mt-2 text-sm text-slate-400">{design.rationale}</p>
          <pre className="mt-3 overflow-x-auto rounded bg-bg p-3 text-xs text-slate-400">{JSON.stringify(design.config, null, 2)}</pre>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="mt-3 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create this bot (disabled by default)"}
          </button>
        </div>
      )}
    </section>
  );
}

function ChatPanel() {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const next: ChatTurn[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const { reply } = await api.ai.chat(next);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Chat request failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-slate-300">Ask the assistant</h2>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-4">
        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {messages.length === 0 && <p className="text-sm text-slate-500">Ask about current signals, bot performance, or Hyperliquid market structure.</p>}
          {messages.map((m, i) => (
            <div key={i} className={`rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "self-end bg-accent/15 text-slate-100" : "self-start bg-white/5 text-slate-300"}`}>
              {m.content}
            </div>
          ))}
        </div>
        {error && <div className="text-sm text-short">{error}</div>}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="e.g. why is funding so negative on ETH right now?"
            className="flex-1 rounded border border-border bg-bg px-3 py-2 text-sm"
          />
          <button
            onClick={send}
            disabled={sending}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </section>
  );
}
