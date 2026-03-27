"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────

interface WatchlistRow {
  ticker: string;
  tier: string;
  added_at: string;
}

type ConfigMap = Record<string, string>;

// ── Helpers ────────────────────────────────────────────────────────

const TIER_OPTIONS = ["tier1", "tier2", "futures", "custom"] as const;

/** Default values — used when a key doesn't exist in the DB yet */
const DEFAULTS: ConfigMap = {
  "movers.min_change_pct": "0.5",
  "movers.min_price": "5",
  "movers.max_results": "10",
  "movers.min_volume": "0",
  "news.score_threshold": "40",
  "news.max_per_cycle": "3",
  "news.lookback_minutes": "60",
  "politics.score_threshold": "15",
  "politics.max_per_cycle": "2",
  "lowfloat.min_float": "100000",
  "lowfloat.max_float": "20000000",
  "lowfloat.min_volume": "100000",
  "flow.min_short_pct": "25",
  "flow.reddit_spike_threshold": "3",
  "flow.reddit_min_mentions": "10",
};

function cfg(config: ConfigMap, key: string): string {
  return config[key] ?? DEFAULTS[key] ?? "0";
}

// ── Components ─────────────────────────────────────────────────────

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-gray-300">{label}</span>
        <span className="font-mono text-white">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-blue-500"
      />
      <div className="flex justify-between text-xs text-gray-500">
        <span>
          {min}
          {suffix}
        </span>
        <span>
          {max}
          {suffix}
        </span>
      </div>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  readonly,
}: {
  label: string;
  value: number;
  onChange?: (v: number) => void;
  readonly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-gray-300">{label}</label>
      <input
        type="number"
        value={value}
        readOnly={readonly}
        onChange={(e) => onChange?.(parseFloat(e.target.value) || 0)}
        className={`rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white font-mono text-sm ${
          readonly ? "opacity-50 cursor-not-allowed" : "focus:border-blue-500 focus:outline-none"
        }`}
      />
    </div>
  );
}

function Section({
  title,
  saving,
  onSave,
  children,
}: {
  title: string;
  saving: boolean;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: "idle" | "loading" | "saved" | "error" }) {
  if (status === "idle") return null;
  const colors = {
    loading: "text-yellow-400",
    saved: "text-green-400",
    error: "text-red-400",
  };
  const labels = {
    loading: "Loading...",
    saved: "Saved",
    error: "Error saving",
  };
  return <span className={`text-sm ${colors[status]}`}>{labels[status]}</span>;
}

// ── Main Dashboard ─────────────────────────────────────────────────

export default function DashboardPage() {
  const [config, setConfig] = useState<ConfigMap>({});
  const [watchlist, setWatchlist] = useState<WatchlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionStatus, setSectionStatus] = useState<
    Record<string, "idle" | "loading" | "saved" | "error">
  >({});
  const [newTicker, setNewTicker] = useState("");
  const [newTier, setNewTier] = useState<string>("custom");

  // Fetch config and watchlist on mount
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, wlRes] = await Promise.all([
        fetch("/api/config"),
        fetch("/api/watchlist"),
      ]);
      if (cfgRes.ok) {
        const raw = await cfgRes.json();
        const flat: ConfigMap = {};
        for (const [k, v] of Object.entries(raw)) {
          flat[k] = (v as { value: string }).value;
        }
        setConfig(flat);
      }
      if (wlRes.ok) {
        setWatchlist(await wlRes.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update a config value in local state
  function set(key: string, value: string | number) {
    setConfig((prev) => ({ ...prev, [key]: String(value) }));
  }

  // Save a set of keys to the API
  async function saveKeys(section: string, keys: string[]) {
    setSectionStatus((s) => ({ ...s, [section]: "loading" }));
    const payload: Record<string, string> = {};
    for (const k of keys) {
      payload[k] = cfg(config, k);
    }
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSectionStatus((s) => ({
        ...s,
        [section]: res.ok ? "saved" : "error",
      }));
      if (res.ok) {
        setTimeout(
          () => setSectionStatus((s) => ({ ...s, [section]: "idle" })),
          2000
        );
      }
    } catch {
      setSectionStatus((s) => ({ ...s, [section]: "error" }));
    }
  }

  // Watchlist actions
  async function addTicker() {
    const t = newTicker.trim().toUpperCase();
    if (!t) return;
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: t, tier: newTier }),
    });
    if (res.ok) {
      setNewTicker("");
      loadData();
    }
  }

  async function removeTicker(ticker: string) {
    const res = await fetch(`/api/watchlist?ticker=${ticker}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setWatchlist((prev) => prev.filter((r) => r.ticker !== ticker));
    }
  }

  async function changeTier(ticker: string, tier: string) {
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, tier }),
    });
    if (res.ok) {
      setWatchlist((prev) =>
        prev.map((r) => (r.ticker === ticker ? { ...r, tier } : r))
      );
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-gray-400">
        <p className="text-lg">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-white">TraderPals Dashboard</h1>
            <p className="text-sm text-gray-400">Bot configuration &amp; watchlist manager</p>
          </div>
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            &larr; Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 flex flex-col gap-8">
        {/* ── Market Movers ─────────────────────────────── */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Market Movers
            </h2>
            <StatusBadge status={sectionStatus["movers"] ?? "idle"} />
          </div>
          <Section
            title="Market Movers"
            saving={sectionStatus["movers"] === "loading"}
            onSave={() =>
              saveKeys("movers", [
                "movers.min_change_pct",
                "movers.min_price",
                "movers.max_results",
                "movers.min_volume",
              ])
            }
          >
            <Slider
              label="Min Change %"
              value={parseFloat(cfg(config, "movers.min_change_pct"))}
              min={0.1}
              max={10}
              step={0.1}
              suffix="%"
              onChange={(v) => set("movers.min_change_pct", v)}
            />
            <NumberInput
              label="Min Price ($)"
              value={parseFloat(cfg(config, "movers.min_price"))}
              onChange={(v) => set("movers.min_price", v)}
            />
            <Slider
              label="Max Results Per Section"
              value={parseInt(cfg(config, "movers.max_results"))}
              min={1}
              max={20}
              step={1}
              onChange={(v) => set("movers.max_results", v)}
            />
            <NumberInput
              label="Min Volume"
              value={parseFloat(cfg(config, "movers.min_volume"))}
              onChange={(v) => set("movers.min_volume", v)}
            />
          </Section>
        </div>

        {/* ── Low Float Scanner ──────────────────────────── */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Low Float Scanner
            </h2>
            <StatusBadge status={sectionStatus["lowfloat"] ?? "idle"} />
          </div>
          <Section
            title="Low Float Scanner"
            saving={sectionStatus["lowfloat"] === "loading"}
            onSave={() =>
              saveKeys("lowfloat", [
                "lowfloat.min_float",
                "lowfloat.max_float",
                "lowfloat.min_volume",
              ])
            }
          >
            <NumberInput
              label="Min Float (shares)"
              value={parseFloat(cfg(config, "lowfloat.min_float"))}
              onChange={(v) => set("lowfloat.min_float", v)}
            />
            <NumberInput
              label="Max Float (shares)"
              value={parseFloat(cfg(config, "lowfloat.max_float"))}
              onChange={(v) => set("lowfloat.max_float", v)}
            />
            <NumberInput
              label="Min Volume"
              value={parseFloat(cfg(config, "lowfloat.min_volume"))}
              onChange={(v) => set("lowfloat.min_volume", v)}
            />
          </Section>
        </div>

        {/* ── News Bot ──────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              News Bot
            </h2>
            <StatusBadge status={sectionStatus["news"] ?? "idle"} />
          </div>
          <Section
            title="News Bot"
            saving={sectionStatus["news"] === "loading"}
            onSave={() =>
              saveKeys("news", [
                "news.score_threshold",
                "news.max_per_cycle",
                "news.lookback_minutes",
              ])
            }
          >
            <Slider
              label="Score Threshold"
              value={parseInt(cfg(config, "news.score_threshold"))}
              min={10}
              max={100}
              step={1}
              onChange={(v) => set("news.score_threshold", v)}
            />
            <Slider
              label="Max Posts Per Scan Cycle"
              value={parseInt(cfg(config, "news.max_per_cycle"))}
              min={1}
              max={10}
              step={1}
              onChange={(v) => set("news.max_per_cycle", v)}
            />
            <Slider
              label="Article Lookback"
              value={parseInt(cfg(config, "news.lookback_minutes"))}
              min={15}
              max={120}
              step={5}
              suffix=" min"
              onChange={(v) => set("news.lookback_minutes", v)}
            />
            <NumberInput
              label="Company Scan Interval (minutes)"
              value={15}
              readonly
            />
          </Section>
        </div>

        {/* ── Political News ────────────────────────────── */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Political News
            </h2>
            <StatusBadge status={sectionStatus["politics"] ?? "idle"} />
          </div>
          <Section
            title="Political News"
            saving={sectionStatus["politics"] === "loading"}
            onSave={() =>
              saveKeys("politics", [
                "politics.score_threshold",
                "politics.max_per_cycle",
              ])
            }
          >
            <Slider
              label="Score Threshold"
              value={parseInt(cfg(config, "politics.score_threshold"))}
              min={5}
              max={50}
              step={1}
              onChange={(v) => set("politics.score_threshold", v)}
            />
            <Slider
              label="Max Posts Per Cycle"
              value={parseInt(cfg(config, "politics.max_per_cycle"))}
              min={1}
              max={5}
              step={1}
              onChange={(v) => set("politics.max_per_cycle", v)}
            />
          </Section>
        </div>

        {/* ── Flow / Sentiment ──────────────────────────── */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Flow / Sentiment
            </h2>
            <StatusBadge status={sectionStatus["flow"] ?? "idle"} />
          </div>
          <Section
            title="Flow / Sentiment"
            saving={sectionStatus["flow"] === "loading"}
            onSave={() =>
              saveKeys("flow", [
                "flow.min_short_pct",
                "flow.reddit_spike_threshold",
                "flow.reddit_min_mentions",
              ])
            }
          >
            <Slider
              label="Min Short % to Show"
              value={parseInt(cfg(config, "flow.min_short_pct"))}
              min={10}
              max={70}
              step={1}
              suffix="%"
              onChange={(v) => set("flow.min_short_pct", v)}
            />
            <Slider
              label="Reddit Spike Threshold"
              value={parseFloat(cfg(config, "flow.reddit_spike_threshold"))}
              min={2}
              max={10}
              step={0.5}
              suffix="x"
              onChange={(v) => set("flow.reddit_spike_threshold", v)}
            />
            <Slider
              label="Reddit Min Mentions"
              value={parseInt(cfg(config, "flow.reddit_min_mentions"))}
              min={5}
              max={50}
              step={1}
              onChange={(v) => set("flow.reddit_min_mentions", v)}
            />
          </Section>
        </div>

        {/* ── Watchlist Manager ─────────────────────────── */}
        <div className="rounded-xl border border-gray-700 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-white mb-5">
            Watchlist Manager
          </h2>

          {/* Add ticker form */}
          <div className="flex gap-2 mb-5">
            <input
              type="text"
              placeholder="Ticker (e.g. AAPL)"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && addTicker()}
              className="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
            <select
              value={newTier}
              onChange={(e) => setNewTier(e.target.value)}
              className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
            >
              {TIER_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              onClick={addTicker}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 transition-colors"
            >
              Add
            </button>
          </div>

          {/* Group by tier */}
          {TIER_OPTIONS.map((tier) => {
            const tickers = watchlist.filter((w) => w.tier === tier);
            if (tickers.length === 0) return null;
            return (
              <div key={tier} className="mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                  {tier} ({tickers.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {tickers.map((w) => (
                    <div
                      key={w.ticker}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm"
                    >
                      <span className="font-mono font-medium text-white">
                        {w.ticker}
                      </span>
                      <select
                        value={w.tier}
                        onChange={(e) => changeTier(w.ticker, e.target.value)}
                        className="bg-transparent text-xs text-gray-400 border-none focus:outline-none cursor-pointer"
                      >
                        {TIER_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeTicker(w.ticker)}
                        className="ml-1 text-gray-500 hover:text-red-400 transition-colors"
                        title={`Remove ${w.ticker}`}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {watchlist.length === 0 && (
            <p className="text-sm text-gray-500">No tickers in watchlist.</p>
          )}
        </div>
      </main>
    </div>
  );
}
