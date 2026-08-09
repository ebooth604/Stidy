import { eq } from "drizzle-orm";
import { getBotSummaries } from "../bots/summary.js";
import type { AppDb } from "../db/client.js";
import { SINGLETON_ACCOUNT_ID } from "../db/client.js";
import { paperAccountTable } from "../db/schema.js";
import { isCmcConfigured } from "../external/coinmarketcap.js";
import type { SignalEngine } from "../signals/engine.js";

/** Builds a compact, plain-text snapshot of live signals, portfolio and bot
 * state for injection into AI prompts. Kept as text (not raw JSON dumps) so
 * token usage stays predictable regardless of how many assets Hyperliquid lists.
 */
export function buildContextSnapshot(db: AppDb, signalEngine: SignalEngine): string {
  const { basis, funding, whaleTrades, cmcBasis } = signalEngine.getLatestSignals();
  const imbalances = signalEngine.getWhaleImbalances();
  const account = db
    .select()
    .from(paperAccountTable)
    .where(eq(paperAccountTable.id, SINGLETON_ACCOUNT_ID))
    .get();
  const bots = getBotSummaries(db);

  const lines: string[] = [];

  lines.push(`# Paper account`);
  if (account) {
    lines.push(
      `Balance: $${account.balance.toFixed(2)} | Peak: $${account.peakBalance.toFixed(2)} | Trades: ${account.tradeCount} | Consecutive losses: ${account.consecutiveLosses}`,
    );
  }

  lines.push(`\n# Bots (${bots.length})`);
  for (const bot of bots) {
    lines.push(
      `- "${bot.name}" [${bot.strategy}] ${bot.enabled ? "ENABLED" : "disabled"} — ` +
        `open=${bot.openPositions}/${bot.config.maxPositions}, trades=${bot.totalTrades}, ` +
        `winRate=${bot.winRate ?? "n/a"}%, totalPnl=$${bot.totalPnl}, ` +
        `config={minSignalValue:${bot.config.minSignalValue}, stopLossPct:${bot.config.stopLossPct}, ` +
        `takeProfitPct:${bot.config.takeProfitPct}, positionSizeUsd:${bot.config.positionSizeUsd}, ` +
        `maxDrawdownPct:${bot.config.maxDrawdownPct}}`,
    );
  }

  lines.push(`\n# Top basis gaps (perp mark vs Hyperliquid oracle price, %)`);
  for (const s of basis.slice(0, 10)) {
    lines.push(`- ${s.coin}: ${s.direction} bias, gap=${s.context.gapPct}% (mark=${s.context.markPx}, oracle=${s.context.oraclePx})`);
  }
  if (basis.length === 0) lines.push("- none above threshold right now");

  lines.push(`\n# Funding extremes (annualized %)`);
  for (const s of funding.slice(0, 10)) {
    lines.push(`- ${s.coin}: ${s.direction} bias, fundingApr=${s.context.fundingApr}%, openInterest=${s.context.openInterest}`);
  }
  if (funding.length === 0) lines.push("- none above threshold right now");

  if (isCmcConfigured()) {
    lines.push(`\n# CoinMarketCap cross-check (Hyperliquid mark vs broader-market spot price, %)`);
    for (const s of cmcBasis.slice(0, 10)) {
      lines.push(
        `- ${s.coin}: ${s.direction} bias, gap=${s.context.gapPct}% (mark=${s.context.markPx}, cmcSpot=${s.context.cmcSpotPx})`,
      );
    }
    if (cmcBasis.length === 0) lines.push("- none above threshold right now");
  }

  lines.push(`\n# Whale trades (last 15m net notional, top 8 by |net|)`);
  for (const imb of imbalances.slice(0, 8)) {
    lines.push(`- ${imb.coin}: net $${Math.round(imb.netUsd).toLocaleString()} (buy $${Math.round(imb.buyUsd).toLocaleString()} / sell $${Math.round(imb.sellUsd).toLocaleString()})`);
  }
  lines.push(`Recent whale prints: ${whaleTrades.length}`);

  return lines.join("\n");
}
