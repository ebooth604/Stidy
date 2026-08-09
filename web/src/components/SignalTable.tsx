import type { Signal } from "../types";
import { DirectionBadge } from "./DirectionBadge";
import { EmptyState } from "./EmptyState";

function formatContext(signal: Signal): string {
  const c = signal.context;
  if (signal.type === "basis") return `mark ${c.markPx} vs oracle ${c.oraclePx}`;
  if (signal.type === "cmc_basis") return `mark ${c.markPx} vs CMC spot ${c.cmcSpotPx} (${c.cmcSymbol})`;
  if (signal.type === "funding") return `funding APR ${c.fundingApr}% · OI ${c.openInterest}`;
  return `${c.side} $${Number(c.notionalUsd).toLocaleString()} @ ${c.px}`;
}

export function SignalTable({ signals, valueLabel, valueSuffix }: { signals: Signal[]; valueLabel: string; valueSuffix: string }) {
  if (signals.length === 0) return <EmptyState message="No signals above threshold right now." />;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Coin</th>
            <th className="px-3 py-2">Bias</th>
            <th className="px-3 py-2">{valueLabel}</th>
            <th className="px-3 py-2">Detail</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => (
            <tr key={s.id} className="border-t border-border/60 hover:bg-white/5">
              <td className="px-3 py-2 font-medium">{s.coin}</td>
              <td className="px-3 py-2">
                <DirectionBadge direction={s.direction} />
              </td>
              <td className="px-3 py-2 tabular-nums">
                {s.value.toFixed(2)}
                {valueSuffix}
              </td>
              <td className="px-3 py-2 text-slate-400">{formatContext(s)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
