import { useState } from "react";
import type { BotConfig, StrategyName } from "../types";

export interface BotFormValues {
  name: string;
  strategy: StrategyName;
  config: BotConfig;
  pollIntervalSeconds: number;
  enabled: boolean;
}

const DEFAULT_VALUES: BotFormValues = {
  name: "",
  strategy: "basis_reversion",
  config: {
    minSignalValue: 0.2,
    stopLossPct: 1.5,
    takeProfitPct: 1,
    positionSizeUsd: 500,
    maxPositions: 5,
    maxDrawdownPct: 20,
    liveTrading: false,
  },
  pollIntervalSeconds: 60,
  enabled: false,
};

export function BotForm({
  initial,
  submitLabel,
  onSubmit,
  submitting,
  liveTradingConfigured,
}: {
  initial?: Partial<BotFormValues>;
  submitLabel: string;
  onSubmit: (values: BotFormValues) => void;
  submitting?: boolean;
  /** Whether the SERVER has live trading configured at all (health.liveTradingConfigured).
   * When false, the live-trading toggle is shown but disabled with an explanation. */
  liveTradingConfigured: boolean;
}) {
  const [values, setValues] = useState<BotFormValues>({
    ...DEFAULT_VALUES,
    ...initial,
    config: { ...DEFAULT_VALUES.config, ...initial?.config },
  });

  function setConfig<K extends keyof BotConfig>(key: K, value: BotConfig[K]) {
    setValues((v) => ({ ...v, config: { ...v.config, [key]: value } }));
  }

  function handleLiveTradingToggle(checked: boolean) {
    if (checked) {
      const confirmed = confirm(
        "This bot will place REAL orders on Hyperliquid with real funds when enabled. " +
          "Are you sure you want to turn on live trading for this bot?",
      );
      if (!confirmed) return;
    }
    setConfig("liveTrading", checked);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">Name</span>
          <input
            required
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            className="rounded border border-border bg-bg px-3 py-2"
            placeholder="e.g. Basis fade — majors"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">Strategy</span>
          <select
            value={values.strategy}
            onChange={(e) => setValues((v) => ({ ...v, strategy: e.target.value as StrategyName }))}
            className="rounded border border-border bg-bg px-3 py-2"
          >
            <option value="basis_reversion">Basis reversion (mark vs oracle)</option>
            <option value="funding_reversion">Funding reversion (fade the crowd)</option>
            <option value="cmc_basis_reversion">CMC reversion (mark vs broader-market spot)</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <NumberField
          label={values.strategy === "basis_reversion" ? "Min gap %" : "Min funding APR %"}
          value={values.config.minSignalValue}
          onChange={(v) => setConfig("minSignalValue", v)}
          step={0.05}
        />
        <NumberField label="Stop loss %" value={values.config.stopLossPct} onChange={(v) => setConfig("stopLossPct", v)} step={0.1} />
        <NumberField label="Take profit %" value={values.config.takeProfitPct} onChange={(v) => setConfig("takeProfitPct", v)} step={0.1} />
        <NumberField label="Position size $" value={values.config.positionSizeUsd} onChange={(v) => setConfig("positionSizeUsd", v)} step={50} />
        <NumberField label="Max positions" value={values.config.maxPositions} onChange={(v) => setConfig("maxPositions", v)} step={1} />
        <NumberField label="Max drawdown % (0=off)" value={values.config.maxDrawdownPct} onChange={(v) => setConfig("maxDrawdownPct", v)} step={1} />
        <NumberField
          label="Poll interval (s)"
          value={values.pollIntervalSeconds}
          onChange={(v) => setValues((val) => ({ ...val, pollIntervalSeconds: v }))}
          step={15}
        />
        <label className="flex items-center gap-2 text-sm text-slate-400 self-end pb-2">
          <input
            type="checkbox"
            checked={values.enabled}
            onChange={(e) => setValues((v) => ({ ...v, enabled: e.target.checked }))}
          />
          Enabled
        </label>
      </div>

      <div className={`rounded-lg border p-3 ${values.config.liveTrading ? "border-short/50 bg-short/10" : "border-border bg-panel"}`}>
        <label className={`flex items-center gap-2 text-sm font-medium ${liveTradingConfigured ? "text-slate-200" : "text-slate-500"}`}>
          <input
            type="checkbox"
            disabled={!liveTradingConfigured}
            checked={values.config.liveTrading}
            onChange={(e) => handleLiveTradingToggle(e.target.checked)}
          />
          Live trading — place REAL orders with real funds
        </label>
        <p className="mt-1 text-xs text-slate-500">
          {liveTradingConfigured
            ? "This bot will trade its own separate live position size (capped by HYPERLIQUID_LIVE_MAX_ORDER_USD on the server), tracked apart from paper trading."
            : "Not available: the server doesn't have live trading configured (HYPERLIQUID_LIVE_TRADING_ENABLED / API wallet key / account address)."}
        </p>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
      >
        {submitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-400">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded border border-border bg-bg px-3 py-2"
      />
    </label>
  );
}
