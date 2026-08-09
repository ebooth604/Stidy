import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Trade } from "../types";
import { EmptyState } from "./EmptyState";

/** Cumulative realized P&L across closed trades, oldest first — derived
 * entirely from real trade history, not a simulated equity curve.
 */
export function EquityChart({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) return <EmptyState message="No closed trades yet — the equity curve will appear once bots close positions." />;

  const chronological = [...trades].reverse();
  let cumulative = 0;
  const points = chronological.map((t, i) => {
    cumulative += t.pnl;
    return { index: i + 1, pnl: Math.round(cumulative * 100) / 100, closedAt: t.closedAt };
  });

  return (
    <div className="h-64 rounded-lg border border-border bg-panel p-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points}>
          <defs>
            <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4f8cff" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#4f8cff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="index" stroke="#475569" fontSize={11} tickLine={false} />
          <YAxis stroke="#475569" fontSize={11} tickLine={false} width={70} />
          <Tooltip
            contentStyle={{ background: "#12151f", border: "1px solid #232733", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(i) => `Trade #${i}`}
            formatter={(value: number) => [`$${value.toFixed(2)}`, "Cumulative P&L"]}
          />
          <Area type="monotone" dataKey="pnl" stroke="#4f8cff" fill="url(#pnlGradient)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
