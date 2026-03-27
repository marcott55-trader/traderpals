import { getEarningsCalendar, getFuturesQuotes } from "@/lib/finnhub";
import { COLORS, formatChange, formatPrice, formatVolume } from "@/lib/embeds";
import { getTickerSnapshots, getTopGainers, getTopLosers } from "@/lib/polygon";
import { getEasternDateString, getEasternTime, getEasternTimeString, getFormattedDate } from "@/lib/market-hours";
import { supabase } from "@/lib/supabase";
import type { EconEventRow, EarningsResult } from "@/types/alerts";
import type { DiscordEmbed, FuturesQuote, MarketMover, PolygonSnapshotTicker } from "@/types/market";
import type { EarningsEvent } from "@/lib/finnhub";

export type MarketMapSession = "premarket" | "open" | "midday" | "close";

interface PostedNewsRow {
  ticker: string | null;
  category: string;
  channel: string;
  headline: string | null;
  posted_at: string;
}

interface TickerCatalyst {
  ticker: string;
  category: string;
  headline: string | null;
  posted_at: string;
}

interface MarketMapSnapshot {
  embed: DiscordEmbed;
  summary: {
    regime: string;
    watchlistCount: number;
    catalystCount: number;
    missingSources: string[];
  };
}

type WatchlistTier = "tier1" | "tier2" | "futures" | "custom";

type MarketTone = "risk-on" | "risk-off" | "mixed";

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

function formatEventTime(time: string | null): string {
  if (!time) return "TBD";
  const [hour, minute] = time.split(":").map(Number);
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour >= 12 ? "PM" : "AM";
  return `${hour12}:${String(minute).padStart(2, "0")} ET ${ampm}`;
}

function sessionLabel(session: MarketMapSession): string {
  switch (session) {
    case "premarket":
      return "PREMARKET";
    case "open":
      return "OPEN";
    case "midday":
      return "MIDDAY";
    case "close":
      return "CLOSING";
  }
}

function sessionEmoji(session: MarketMapSession): string {
  switch (session) {
    case "premarket":
      return "🌅";
    case "open":
      return "🚀";
    case "midday":
      return "🧭";
    case "close":
      return "📌";
  }
}

function sessionLookbackMinutes(session: MarketMapSession): number {
  switch (session) {
    case "premarket":
      return 12 * 60;
    case "open":
      return 4 * 60;
    case "midday":
      return 3 * 60;
    case "close":
      return 4 * 60;
  }
}

function sessionColor(session: MarketMapSession): number {
  switch (session) {
    case "premarket":
      return COLORS.BLUE;
    case "open":
      return COLORS.GREEN;
    case "midday":
      return COLORS.YELLOW;
    case "close":
      return COLORS.PURPLE;
  }
}

function tickerEmoji(change: number): string {
  return change >= 0 ? "🟢" : "🔴";
}

function minutesSinceMidnight(hour: number, minute: number): number {
  return hour * 60 + minute;
}

function parseDbTimeToMinutes(value: string | null): number | null {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function earningsSessionWindow(hour: string): { label: string; minutes: number | null } {
  if (hour === "bmo") return { label: "Before Open", minutes: 9 * 60 + 30 };
  if (hour === "amc") return { label: "After Close", minutes: 16 * 60 };
  return { label: "Today", minutes: null };
}

function snapshotToMover(
  ticker: PolygonSnapshotTicker,
  watchlist: Map<string, string>
): MarketMover {
  return {
    ticker: ticker.ticker,
    price: ticker.lastTrade?.p ?? ticker.day?.c ?? ticker.min?.c ?? 0,
    changePercent: ticker.todaysChangePerc ?? 0,
    volume: ticker.day?.v || ticker.min?.av || 0,
    isWatchlist: watchlist.has(ticker.ticker),
    tier: watchlist.get(ticker.ticker) ?? null,
  };
}

async function getWatchlistMap(): Promise<Map<string, WatchlistTier>> {
  const { data, error } = await supabase.from("watchlist").select("ticker, tier");
  if (error) throw new Error(`Watchlist query failed: ${error.message}`);

  const watchlist = new Map<string, WatchlistTier>();
  for (const row of data ?? []) {
    watchlist.set(row.ticker, row.tier as WatchlistTier);
  }
  return watchlist;
}

async function getBroadMovers(
  watchlist: Map<string, string>
): Promise<{ gainers: MarketMover[]; losers: MarketMover[] }> {
  const [rawGainers, rawLosers] = await Promise.all([getTopGainers(), getTopLosers()]);
  const gainers = rawGainers
    .map((ticker) => snapshotToMover(ticker, watchlist))
    .filter((mover) => mover.price >= 5)
    .slice(0, 6);
  const losers = rawLosers
    .map((ticker) => snapshotToMover(ticker, watchlist))
    .filter((mover) => mover.price >= 5)
    .slice(0, 6);
  return { gainers, losers };
}

async function getWatchlistMovers(
  watchlist: Map<string, string>
): Promise<MarketMover[]> {
  const tickers = Array.from(watchlist.keys());
  if (tickers.length === 0) return [];

  const snapshots = await getTickerSnapshots(tickers);
  return snapshots
    .map((ticker) => snapshotToMover(ticker, watchlist))
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

async function getTodayEconEvents(): Promise<EconEventRow[]> {
  const today = getEasternDateString();
  const { data, error } = await supabase
    .from("econ_events")
    .select("*")
    .eq("event_date", today)
    .order("event_time", { ascending: true, nullsFirst: false });

  if (error) throw new Error(`econ_events query failed: ${error.message}`);
  return (data ?? []) as EconEventRow[];
}

async function getFreshCatalysts(lookbackMinutes: number): Promise<PostedNewsRow[]> {
  const cutoff = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("posted_news")
    .select("ticker, category, channel, headline, posted_at")
    .gte("posted_at", cutoff)
    .order("posted_at", { ascending: false })
    .limit(12);

  if (error) throw new Error(`posted_news query failed: ${error.message}`);
  return (data ?? []) as PostedNewsRow[];
}

async function getTickerCatalysts(
  tickers: string[],
  lookbackMinutes: number
): Promise<Map<string, TickerCatalyst[]>> {
  if (tickers.length === 0) return new Map();

  const cutoff = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("posted_news")
    .select("ticker, category, headline, posted_at")
    .in("ticker", tickers)
    .gte("posted_at", cutoff)
    .order("posted_at", { ascending: false })
    .limit(40);

  if (error) throw new Error(`posted_news ticker query failed: ${error.message}`);

  const byTicker = new Map<string, TickerCatalyst[]>();
  for (const row of (data ?? []) as TickerCatalyst[]) {
    if (!row.ticker) continue;
    const existing = byTicker.get(row.ticker) ?? [];
    existing.push(row);
    byTicker.set(row.ticker, existing);
  }

  return byTicker;
}

function getToneLabel(avgFutures: number | null, watchlistMovers: MarketMover[]): MarketTone {
  if (avgFutures != null) {
    if (avgFutures >= 0.35) return "risk-on";
    if (avgFutures <= -0.35) return "risk-off";
  }

  const active = watchlistMovers.filter((mover) => Math.abs(mover.changePercent) >= 1);
  const positives = active.filter((mover) => mover.changePercent > 0).length;
  const negatives = active.filter((mover) => mover.changePercent < 0).length;

  if (positives > negatives + 1) return "risk-on";
  if (negatives > positives + 1) return "risk-off";
  return "mixed";
}

function describeSessionSetup(
  session: MarketMapSession,
  tone: MarketTone,
  catalystCount: number
): string {
  const eventTag = catalystCount > 0 ? "event-driven" : "news-light";

  switch (session) {
    case "premarket":
      if (tone === "risk-on") return `Premarket continuation bias; likely ${eventTag} open.`;
      if (tone === "risk-off") return `Gap-down pressure; watch weak bounces and failed pops.`;
      return `Balanced tape into the open; expect selective setups and quick rotation.`;
    case "open":
      if (tone === "risk-on") return `Opening drive favored if leaders keep volume.`;
      if (tone === "risk-off") return `Fade risk is high; prioritize relative strength and clean levels.`;
      return `Open looks mixed; let the first move prove itself before pressing.`;
    case "midday":
      if (tone === "risk-on") return `Trend-day bias intact unless leaders start stalling.`;
      if (tone === "risk-off") return `Defensive tape; size down unless the trend extends cleanly.`;
      return `Midday rotation likely; only press setups with clear catalysts.`;
    case "close":
      if (tone === "risk-on") return `Strength into the close; watch for continuation names to hold highs.`;
      if (tone === "risk-off") return `Late-day pressure; focus on weak closes and failed reclaim attempts.`;
      return `Closing tape looks mixed; prioritize names with still-active catalysts.`;
  }
}

function formatWatchlistLine(mover: MarketMover, rank: number): string {
  return `${rank}. ${tickerEmoji(mover.changePercent)} **${mover.ticker}** ${formatChange(mover.changePercent)} ${formatPrice(mover.price)} Vol ${formatVolume(mover.volume)}`;
}

function explainWatchlistMover(
  mover: MarketMover,
  tickerCatalysts: Map<string, TickerCatalyst[]>,
  earningsResults: EarningsResult[],
  upcomingWatchlistEarnings: EarningsEvent[]
): string {
  const earningsResult = earningsResults.find((result) => result.ticker === mover.ticker);
  if (earningsResult) {
    return earningsResult.isBeat == null
      ? "fresh earnings print"
      : earningsResult.isBeat
        ? "earnings beat"
        : "earnings miss";
  }

  const catalyst = tickerCatalysts.get(mover.ticker)?.[0];
  if (catalyst?.headline) {
    return truncate(catalyst.headline, 44);
  }

  const upcoming = upcomingWatchlistEarnings.find((event) => event.symbol === mover.ticker);
  if (upcoming) {
    return `earnings ${earningsSessionWindow(upcoming.hour).label.toLowerCase()}`;
  }

  if (Math.abs(mover.changePercent) >= 3) return "range expansion";
  if (mover.volume >= 2_000_000) return "volume expansion";
  return "price-driven move";
}

function formatBroadMoverLine(mover: MarketMover): string {
  const star = mover.isWatchlist ? "⭐ " : "";
  return `${tickerEmoji(mover.changePercent)} ${star}${mover.ticker} ${formatChange(mover.changePercent)} ${formatPrice(mover.price)}`;
}

function formatEconCatalyst(event: EconEventRow): string {
  const fed = event.is_fed_speech ? " Fed" : "";
  return `${formatEventTime(event.event_time)} ${truncate(event.event_name, 50)}${fed}`;
}

function formatEarningsCatalyst(event: EarningsEvent): string {
  const timing = earningsSessionWindow(event.hour).label;
  return `${timing}: **${event.symbol}**`;
}

function formatEarningsResultLine(result: EarningsResult): string {
  const beatLabel = result.isBeat == null ? "reported" : result.isBeat ? "beat" : "miss";
  const epsText = result.epsActual != null ? `EPS ${result.epsActual.toFixed(2)}` : "reported";
  return `**${result.ticker}** ${beatLabel} ${epsText}`;
}

function formatHeadline(row: PostedNewsRow): string {
  const prefix = row.category === "political"
    ? "Politics"
    : row.category === "macro"
      ? "Macro"
      : row.ticker
        ? row.ticker
        : "News";
  return `${prefix}: ${truncate(row.headline ?? "Headline unavailable", 80)}`;
}

function buildLeadersLaggardsValue(gainers: MarketMover[], losers: MarketMover[]): string {
  const leaders = gainers.slice(0, 3).map(formatBroadMoverLine);
  const laggards = losers.slice(0, 3).map(formatBroadMoverLine);

  const sections: string[] = [];
  sections.push(`Leaders\n${leaders.length > 0 ? leaders.join("\n") : "No leaders available"}`);
  sections.push(`Laggards\n${laggards.length > 0 ? laggards.join("\n") : "No laggards available"}`);
  return sections.join("\n\n");
}

export async function buildMarketMap(session: MarketMapSession): Promise<MarketMapSnapshot> {
  const watchlist = await getWatchlistMap();
  const lookbackMinutes = sessionLookbackMinutes(session);
  const { hour, minute } = getEasternTime();
  const nowMinutes = minutesSinceMidnight(hour, minute);

  const missingSources: string[] = [];

  const [
    futuresResult,
    broadMoversResult,
    watchlistMoversResult,
    econResult,
    earningsResult,
    catalystsResult,
    tickerCatalystsResult,
  ] = await Promise.allSettled([
    getFuturesQuotes(),
    getBroadMovers(watchlist),
    getWatchlistMovers(watchlist),
    getTodayEconEvents(),
    getEarningsCalendar(getEasternDateString(), getEasternDateString()),
    getFreshCatalysts(lookbackMinutes),
    getTickerCatalysts(Array.from(watchlist.keys()), lookbackMinutes),
  ]);

  const futures: FuturesQuote[] = futuresResult.status === "fulfilled" ? futuresResult.value : [];
  if (futuresResult.status === "rejected") missingSources.push("futures");

  const broadMovers = broadMoversResult.status === "fulfilled"
    ? broadMoversResult.value
    : { gainers: [], losers: [] };
  if (broadMoversResult.status === "rejected") missingSources.push("movers");

  const watchlistMovers = watchlistMoversResult.status === "fulfilled"
    ? watchlistMoversResult.value
    : [];
  if (watchlistMoversResult.status === "rejected") missingSources.push("watchlist");

  const econEvents = econResult.status === "fulfilled" ? econResult.value : [];
  if (econResult.status === "rejected") missingSources.push("econ");

  const earningsEvents = earningsResult.status === "fulfilled" ? earningsResult.value : [];
  if (earningsResult.status === "rejected") missingSources.push("earnings");

  const freshCatalysts = catalystsResult.status === "fulfilled" ? catalystsResult.value : [];
  if (catalystsResult.status === "rejected") missingSources.push("news");
  const tickerCatalysts = tickerCatalystsResult.status === "fulfilled" ? tickerCatalystsResult.value : new Map();
  if (tickerCatalystsResult.status === "rejected") missingSources.push("ticker-news");

  const watchlistSet = new Set(Array.from(watchlist.keys()));
  const activeWatchlist = watchlistMovers
    .filter((mover) => Math.abs(mover.changePercent) >= 1 || mover.volume > 500_000)
    .slice(0, 6);

  const upcomingHighImpact = econEvents
    .filter((event) => event.impact === "high")
    .filter((event) => {
      const eventMinutes = parseDbTimeToMinutes(event.event_time);
      return eventMinutes == null || eventMinutes >= nowMinutes;
    })
    .slice(0, 3);

  const econResults = econEvents
    .filter((event) => event.actual != null)
    .sort((a, b) => {
      const aMinutes = parseDbTimeToMinutes(a.event_time) ?? 0;
      const bMinutes = parseDbTimeToMinutes(b.event_time) ?? 0;
      return bMinutes - aMinutes;
    })
    .slice(0, 2);

  const todayWatchlistEarnings = earningsEvents
    .filter((event) => watchlistSet.has(event.symbol))
    .slice(0, 5);

  const earningsResults: EarningsResult[] = earningsEvents
    .filter((event) => watchlistSet.has(event.symbol) && event.epsActual != null)
    .map((event) => ({
      ticker: event.symbol,
      epsActual: event.epsActual,
      epsEstimate: event.epsEstimate,
      revenueActual: event.revenueActual,
      revenueEstimate: event.revenueEstimate,
      hour: event.hour,
      reportDate: getEasternDateString(),
      isBeat: event.epsEstimate != null ? event.epsActual! >= event.epsEstimate : null,
      isWatchlist: true,
    }))
    .slice(0, 3);

  const avgFutures = futures.length > 0
    ? futures.reduce((sum, quote) => sum + quote.changePercent, 0) / futures.length
    : null;
  const tone = getToneLabel(avgFutures, watchlistMovers);
  const regimeLabel = tone === "risk-on" ? "Risk-On" : tone === "risk-off" ? "Risk-Off" : "Mixed";
  const setupLabel = describeSessionSetup(
    session,
    tone,
    freshCatalysts.length + upcomingHighImpact.length + earningsResults.length
  );

  const marketToneLines: string[] = [
    `Regime: **${regimeLabel}**`,
    setupLabel,
  ];

  if (futures.length > 0) {
    marketToneLines.push(
      `Futures: ${futures.map((quote) => `${quote.name} ${formatChange(quote.changePercent)}`).join(" | ")}`
    );
  } else {
    marketToneLines.push("Futures unavailable; leaning on price action and catalysts.");
  }

  const watchlistPositive = activeWatchlist.filter((mover) => mover.changePercent > 0).length;
  const watchlistNegative = activeWatchlist.filter((mover) => mover.changePercent < 0).length;
  marketToneLines.push(
    activeWatchlist.length > 0
      ? `Watchlist breadth: ${watchlistPositive} green / ${watchlistNegative} red names moving >1%.`
      : "Watchlist breadth: quiet so far; no names are standing out yet."
  );

  const catalystLines: string[] = [];
  catalystLines.push(
    ...econResults.map((event) => `Econ result: ${truncate(event.event_name, 42)} ${event.actual ?? ""}`.trim())
  );
  catalystLines.push(
    ...upcomingHighImpact.slice(0, 2).map((event) => `Econ: ${formatEconCatalyst(event)}`)
  );
  catalystLines.push(
    ...earningsResults.slice(0, 2).map((result) => `Result: ${formatEarningsResultLine(result)}`)
  );
  catalystLines.push(
    ...freshCatalysts.slice(0, 3).map((row) => formatHeadline(row))
  );
  const trimmedCatalystLines = catalystLines.length > 0
    ? catalystLines.slice(0, 5)
    : ["No fresh catalysts yet; this is mostly a price-action tape right now."];

  const nextLines: string[] = [];
  nextLines.push(
    ...upcomingHighImpact.map((event) => `Next econ: ${formatEconCatalyst(event)}`)
  );

  const upcomingWatchlistEarnings = todayWatchlistEarnings
    .filter((event) => {
      const timing = earningsSessionWindow(event.hour).minutes;
      return timing == null || timing >= nowMinutes;
    })
    .slice(0, 2);
  const watchlistLines = activeWatchlist.length > 0
    ? activeWatchlist.map((mover, index) => {
        const explanation = explainWatchlistMover(
          mover,
          tickerCatalysts,
          earningsResults,
          upcomingWatchlistEarnings
        );
        return `${formatWatchlistLine(mover, index + 1)} — ${explanation}`;
      })
    : ["Nothing special on the watchlist right now. Stay selective and let price lead."];
  nextLines.push(
    ...upcomingWatchlistEarnings.map((event) => `Earnings: ${formatEarningsCatalyst(event)}`)
  );

  if (nextLines.length === 0) {
    nextLines.push("No major scheduled catalysts left today. Focus on follow-through, levels, and volume.");
  }

  const embed: DiscordEmbed = {
    title: `${sessionEmoji(session)} MARKET MAP — ${sessionLabel(session)} — ${getFormattedDate()}`,
    color: sessionColor(session),
    fields: [
      { name: "Market Tone", value: marketToneLines.slice(0, 5).join("\n") },
      { name: "Watchlist In Play", value: watchlistLines.slice(0, 6).join("\n") },
      { name: "Catalysts Today", value: trimmedCatalystLines.join("\n") },
      {
        name: "Leaders / Laggards",
        value: buildLeadersLaggardsValue(broadMovers.gainers, broadMovers.losers),
      },
      { name: "What Matters Next", value: nextLines.slice(0, 5).join("\n") },
    ],
    footer: {
      text: missingSources.length > 0
        ? `Market Map • ${getEasternTimeString()} • Partial data: ${missingSources.join(", ")}`
        : `Market Map • ${getEasternTimeString()}`,
    },
  };

  return {
    embed,
    summary: {
      regime: regimeLabel,
      watchlistCount: activeWatchlist.length,
      catalystCount: trimmedCatalystLines.length,
      missingSources,
    },
  };
}
