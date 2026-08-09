import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Overview", end: true },
  { to: "/signals", label: "Signals" },
  { to: "/bots", label: "Bots" },
  { to: "/ai", label: "AI Insights" },
  { to: "/portfolio", label: "Portfolio" },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 border-r border-border bg-panel p-4 flex flex-col gap-1">
        <div className="mb-6 px-2">
          <div className="text-lg font-semibold tracking-tight">Stidy</div>
          <div className="text-xs text-slate-500">Hyperliquid · paper trading</div>
        </div>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? "bg-accent/15 text-accent" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
        <div className="mt-auto px-2 pt-4 text-xs text-slate-600">
          Paper trading only — no real funds are ever at risk.
        </div>
      </aside>
      <main className="flex-1 p-6 max-w-7xl">{children}</main>
    </div>
  );
}
