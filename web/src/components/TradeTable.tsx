import type { Trade } from "../types";
import { DirectionBadge } from "./DirectionBadge";
import { EmptyState } from "./EmptyState";

export function TradeTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) return <EmptyState message="No closed trades yet." />;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Coin</th>
            <th className="px-3 py-2">Side</th>
            <th className="px-3 py-2">Bot</th>
            <th className="px-3 py-2">Entry → Exit</th>
            <th className="px-3 py-2">Reason</th>
            <th className="px-3 py-2">P&amp;L</th>
            <th className="px-3 py-2">Closed</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className="border-t border-border/60 hover:bg-white/5">
              <td className="px-3 py-2 font-medium">{t.coin}</td>
              <td className="px-3 py-2">
                <DirectionBadge direction={t.side} />
              </td>
              <td className="px-3 py-2 text-slate-400">{t.botName ?? t.botId}</td>
              <td className="px-3 py-2 tabular-nums">
                {t.entryPrice} → {t.exitPrice}
              </td>
              <td className="px-3 py-2 text-slate-400">{t.closeReason.replace("_", " ")}</td>
              <td className={`px-3 py-2 tabular-nums font-medium ${t.pnl >= 0 ? "text-long" : "text-short"}`}>
                {t.pnl >= 0 ? "+" : ""}
                {t.pnl.toFixed(2)} ({t.pnlPct.toFixed(2)}%)
              </td>
              <td className="px-3 py-2 text-slate-400">{new Date(t.closedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
