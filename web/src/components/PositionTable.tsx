import type { Position } from "../types";
import { DirectionBadge } from "./DirectionBadge";
import { EmptyState } from "./EmptyState";

export function PositionTable({ positions, onClose }: { positions: Position[]; onClose?: (id: string) => void }) {
  if (positions.length === 0) return <EmptyState message="No open positions." />;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Coin</th>
            <th className="px-3 py-2">Side</th>
            <th className="px-3 py-2">Bot</th>
            <th className="px-3 py-2">Entry</th>
            <th className="px-3 py-2">Stop / Target</th>
            <th className="px-3 py-2">Opened</th>
            {onClose && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.id} className="border-t border-border/60 hover:bg-white/5">
              <td className="px-3 py-2 font-medium">{p.coin}</td>
              <td className="px-3 py-2">
                <DirectionBadge direction={p.side} />
              </td>
              <td className="px-3 py-2 text-slate-400">{p.botName ?? p.botId}</td>
              <td className="px-3 py-2 tabular-nums">{p.entryPrice}</td>
              <td className="px-3 py-2 tabular-nums text-slate-400">
                {p.stopLoss} / {p.takeProfit}
              </td>
              <td className="px-3 py-2 text-slate-400">{new Date(p.openedAt).toLocaleString()}</td>
              {onClose && (
                <td className="px-3 py-2">
                  <button
                    onClick={() => onClose(p.id)}
                    className="rounded border border-border px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
                  >
                    Close
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
