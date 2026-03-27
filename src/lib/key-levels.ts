import { COLORS, formatChange, formatPrice } from "@/lib/embeds";
import { getEasternTimeString, getFormattedDate } from "@/lib/market-hours";
import { getRecentMinuteBars, getTickerSnapshots } from "@/lib/polygon";
import { supabase } from "@/lib/supabase";
import type { DiscordEmbed, MarketMover, PolygonAggBar, PolygonSnapshotTicker } from "@/types/market";

export type KeyLevelsSession = "premarket" | "open" | "midday";

interface KeyLevelSummary {
  ticker: string;
  price: number;
  changePercent: number;
  vwap: number | null;
  previousHigh: number;
  previousLow: number;
  premarketHigh: number | null;
  premarketLow: number | null;
  openingRangeHigh: number | null;
  openingRangeLow: number | null;
  takeaway: string;
}

function getEasternDateFromTimestamp(timestamp: number): Date {
  return new Date(new Date(timestamp).toLocaleString("en-US", { timeZone: "America/New_York" }));
}

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function formatLevel(label: string, value: number | null): string {
  return `${label} ${value == null ? "n/a" : formatPrice(value)}`;
}

function summarizeTakeaway(levels: KeyLevelSummary): string {
  const abovePrevHigh = levels.price > levels.previousHigh;
  const belowPrevLow = levels.price < levels.previousLow;
  const aboveVwap = levels.vwap != null && levels.price > levels.vwap;

  if (abovePrevHigh) return "Above prior-day high; continuation setup if it holds.";
  if (belowPrevLow) return "Below prior-day low; weakness is controlling unless it reclaims.";
  if (levels.openingRangeHigh != null && levels.price > levels.openingRangeHigh) {
    return "Above opening range high; watch for expansion follow-through.";
  }
  if (levels.openingRangeLow != null && levels.price < levels.openingRangeLow) {
    return "Below opening range low; failed open or trend-down setup.";
  }
  if (aboveVwap) return "Holding above VWAP; intraday buyers still in control.";
  if (levels.vwap != null && levels.price < levels.vwap) return "Below VWAP; rallies can fail unless VWAP is reclaimed.";
  return "Inside key levels; wait for a clean reclaim or breakdown.";
}

function buildLevelsFromBars(
  ticker: string,
  snapshot: PolygonSnapshotTicker,
  bars: PolygonAggBar[],
  session: KeyLevelsSession
): KeyLevelSummary {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const todaysBars = bars.filter((bar) => {
    const et = getEasternDateFromTimestamp(bar.t);
    return et.toLocaleDateString("en-CA") === today;
  });

  const premarketBars = todaysBars.filter((bar) => {
    const et = getEasternDateFromTimestamp(bar.t);
    const minutes = minutesSinceMidnight(et);
    return minutes >= 240 && minutes < 570;
  });

  const openingRangeBars = todaysBars.filter((bar) => {
    const et = getEasternDateFromTimestamp(bar.t);
    const minutes = minutesSinceMidnight(et);
    return minutes >= 570 && minutes < 600;
  });

  const price = snapshot.lastTrade?.p ?? snapshot.day?.c ?? snapshot.min?.c ?? 0;
  const changePercent = snapshot.todaysChangePerc ?? 0;
  const vwap = snapshot.day?.vw ?? snapshot.min?.vw ?? null;

  const premarketHigh = premarketBars.length > 0
    ? Math.max(...premarketBars.map((bar) => bar.h))
    : null;
  const premarketLow = premarketBars.length > 0
    ? Math.min(...premarketBars.map((bar) => bar.l))
    : null;

  const openingRangeHigh = session === "premarket" || openingRangeBars.length === 0
    ? null
    : Math.max(...openingRangeBars.map((bar) => bar.h));
  const openingRangeLow = session === "premarket" || openingRangeBars.length === 0
    ? null
    : Math.min(...openingRangeBars.map((bar) => bar.l));

  const summary: KeyLevelSummary = {
    ticker,
    price,
    changePercent,
    vwap,
    previousHigh: snapshot.prevDay?.h ?? snapshot.day?.h ?? price,
    previousLow: snapshot.prevDay?.l ?? snapshot.day?.l ?? price,
    premarketHigh,
    premarketLow,
    openingRangeHigh,
    openingRangeLow,
    takeaway: "",
  };

  summary.takeaway = summarizeTakeaway(summary);
  return summary;
}

function formatKeyLevelLine(levels: KeyLevelSummary): string {
  const levelBits = [
    formatLevel("PDH", levels.previousHigh),
    formatLevel("PDL", levels.previousLow),
    formatLevel("PMH", levels.premarketHigh),
    formatLevel("PML", levels.premarketLow),
    formatLevel("ORH", levels.openingRangeHigh),
    formatLevel("ORL", levels.openingRangeLow),
    formatLevel("VWAP", levels.vwap),
  ];

  return [
    `**${levels.ticker}** ${formatChange(levels.changePercent)} ${formatPrice(levels.price)}`,
    levelBits.join(" | "),
    levels.takeaway,
  ].join("\n");
}

function sessionTitle(session: KeyLevelsSession): string {
  switch (session) {
    case "premarket":
      return "PREMARKET KEY LEVELS";
    case "open":
      return "OPEN KEY LEVELS";
    case "midday":
      return "MIDDAY KEY LEVELS";
  }
}

async function getWatchlistTickers(): Promise<string[]> {
  const { data, error } = await supabase.from("watchlist").select("ticker");
  if (error) throw new Error(`Watchlist query failed: ${error.message}`);
  return (data ?? []).map((row) => row.ticker);
}

function snapshotToMover(snapshot: PolygonSnapshotTicker): MarketMover {
  return {
    ticker: snapshot.ticker,
    price: snapshot.lastTrade?.p ?? snapshot.day?.c ?? snapshot.min?.c ?? 0,
    changePercent: snapshot.todaysChangePerc ?? 0,
    volume: snapshot.day?.v || snapshot.min?.av || 0,
    isWatchlist: true,
    tier: null,
  };
}

export async function buildKeyLevelsEmbed(
  session: KeyLevelsSession
): Promise<{ embed: DiscordEmbed; summary: { namesTracked: number } }> {
  const watchlistTickers = await getWatchlistTickers();
  const snapshots = await getTickerSnapshots(watchlistTickers);
  const active = snapshots
    .map(snapshotToMover)
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 5);

  const byTicker = new Map(snapshots.map((snapshot) => [snapshot.ticker, snapshot]));
  const levels = await Promise.all(
    active.map(async (mover) => {
      const snapshot = byTicker.get(mover.ticker);
      if (!snapshot) return null;
      const bars = await getRecentMinuteBars(mover.ticker, 5).catch(() => []);
      return buildLevelsFromBars(mover.ticker, snapshot, bars, session);
    })
  );

  const rows = levels.filter(Boolean) as KeyLevelSummary[];
  const description = session === "premarket"
    ? "Prior-day and premarket structure for the names most likely to matter at the open."
    : "Structure-aware levels for the most active watchlist names right now.";

  const embed: DiscordEmbed = {
    title: `🎯 ${sessionTitle(session)} — ${getFormattedDate()}`,
    color: COLORS.YELLOW,
    description,
    fields: rows.length > 0
      ? rows.map((row) => ({
          name: row.ticker,
          value: formatKeyLevelLine(row),
        }))
      : [{
          name: "Quiet Tape",
          value: "No active watchlist names stood out enough to build a levels card.",
        }],
    footer: { text: `Key Levels • ${getEasternTimeString()}` },
  };

  return {
    embed,
    summary: { namesTracked: rows.length },
  };
}
