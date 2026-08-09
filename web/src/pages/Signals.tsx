import { api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { SignalTable } from "../components/SignalTable";
import { usePolling } from "../hooks/usePolling";

export function Signals() {
  const { data, error, loading } = usePolling(api.signals, 10_000);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Live signals</h1>
        <p className="mt-1 text-sm text-slate-500">
          Computed directly from Hyperliquid's public market data — perp mark vs oracle price, annualized funding, and large trade prints.
        </p>
      </div>

      {error && <EmptyState message={`Failed to load signals: ${error}`} />}
      {loading && !data && <EmptyState message="Loading…" />}

      {data && (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-300">Basis gaps (mark vs oracle)</h2>
            <SignalTable signals={data.basis} valueLabel="Gap" valueSuffix="%" />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-300">Funding extremes (annualized)</h2>
            <SignalTable signals={data.funding} valueLabel="Funding APR" valueSuffix="%" />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-300">CoinMarketCap cross-check (mark vs broader-market spot)</h2>
            {data.cmcConfigured ? (
              <SignalTable signals={data.cmcBasis} valueLabel="Gap" valueSuffix="%" />
            ) : (
              <EmptyState message="Not configured — set CMC_API_KEY on the server to enable this cross-check against CoinMarketCap spot prices." />
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-300">Whale trade flow (last 15m net notional)</h2>
            {data.whaleImbalances.length > 0 ? (
              <div className="grid grid-cols-4 gap-3">
                {data.whaleImbalances.slice(0, 12).map((w) => (
                  <div key={w.coin} className="rounded-lg border border-border bg-panel p-3">
                    <div className="text-sm font-medium">{w.coin}</div>
                    <div className={`mt-1 text-sm ${w.netUsd >= 0 ? "text-long" : "text-short"}`}>
                      {w.netUsd >= 0 ? "+" : ""}${Math.round(w.netUsd).toLocaleString()}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      buy ${Math.round(w.buyUsd).toLocaleString()} / sell ${Math.round(w.sellUsd).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No whale-sized trades tracked yet in the last 15 minutes." />
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-300">Recent whale prints</h2>
            <SignalTable signals={data.whaleTrades.slice(0, 20)} valueLabel="Notional" valueSuffix=" USD" />
          </section>
        </>
      )}
    </div>
  );
}
