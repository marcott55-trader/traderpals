/**
 * Embed builders for the Earnings module.
 * Handles: daily calendar, pre-report alerts, result tracking.
 */

import type { DiscordEmbed } from "@/types/market";
import type { EarningsResult } from "@/types/alerts";
import type { EarningsEvent } from "@/lib/finnhub";
import { COLORS, formatPrice, formatChange, formatVolume } from "@/lib/embeds";
import { getEasternTimeString, getFormattedDate } from "@/lib/market-hours";

// ── Daily Earnings Calendar ─────────────────────────────────────────

export function buildDailyEarningsEmbed(
  bmoEvents: EarningsEvent[],
  amcEvents: EarningsEvent[],
  watchlistTickers: Set<string>
): DiscordEmbed {
  const fields = [];

  if (bmoEvents.length > 0) {
    fields.push({
      name: "🌅 BEFORE MARKET OPEN",
      value: bmoEvents
        .map((e) => formatEarningsLine(e, watchlistTickers))
        .join("\n"),
    });
  }

  if (amcEvents.length > 0) {
    fields.push({
      name: "🌙 AFTER MARKET CLOSE",
      value: amcEvents
        .map((e) => formatEarningsLine(e, watchlistTickers))
        .join("\n"),
    });
  }

  if (fields.length === 0) {
    fields.push({
      name: "No Earnings",
      value: "No major earnings reports scheduled for today.",
    });
  }

  return {
    title: `💰 EARNINGS TODAY — ${getFormattedDate()}`,
    color: COLORS.BLUE,
    fields,
    footer: { text: `Finnhub • ${getEasternTimeString()}` },
  };
}

function formatEarningsLine(
  e: EarningsEvent,
  watchlistTickers: Set<string>
): string {
  const star = watchlistTickers.has(e.symbol) ? "⭐ " : "   ";
  const eps = e.epsEstimate != null
    ? `EPS Est: $${e.epsEstimate.toFixed(2)}`
    : "EPS Est: N/A";
  const rev = e.revenueEstimate != null
    ? `Rev Est: ${formatLargeNumber(e.revenueEstimate)}`
    : "";

  return `${star}**${e.symbol}**   ${eps}${rev ? `   ${rev}` : ""}`;
}

function formatLargeNumber(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

// ── Pre-Report Alert ────────────────────────────────────────────────

export function buildPreReportAlertEmbed(
  events: EarningsEvent[],
  session: "BMO" | "AMC"
): DiscordEmbed {
  const emoji = session === "BMO" ? "🌅" : "🌙";
  const label = session === "BMO" ? "Before Market Open" : "After Market Close";

  const fields = events.map((e) => ({
    name: `${e.symbol}`,
    value: [
      e.epsEstimate != null ? `EPS Est: $${e.epsEstimate.toFixed(2)}` : null,
      e.revenueEstimate != null ? `Rev Est: ${formatLargeNumber(e.revenueEstimate)}` : null,
    ].filter(Boolean).join(" | ") || "Estimates unavailable",
    inline: true,
  }));

  return {
    title: `${emoji} WATCHLIST EARNINGS — ${label}`,
    color: COLORS.YELLOW,
    description: `${events.length} watchlist ticker${events.length === 1 ? "" : "s"} reporting ${label.toLowerCase()}`,
    fields,
    footer: { text: `Finnhub • ${getEasternTimeString()}` },
  };
}

// ── Earnings Result ─────────────────────────────────────────────────

export function buildEarningsResultEmbed(result: EarningsResult): DiscordEmbed {
  const isBeat = result.isBeat;
  const emoji = isBeat ? "✅" : "❌";
  const verb = isBeat ? "BEATS" : "MISSES";
  const color = isBeat ? COLORS.GREEN : COLORS.RED;

  const fields = [];

  // EPS
  if (result.epsActual != null && result.epsEstimate != null) {
    const epsDiff = ((result.epsActual - result.epsEstimate) / Math.abs(result.epsEstimate)) * 100;
    const epsDiffStr = epsDiff >= 0 ? `+${epsDiff.toFixed(1)}% beat` : `${epsDiff.toFixed(1)}% miss`;
    fields.push({
      name: "EPS",
      value: `$${result.epsActual.toFixed(2)} vs $${result.epsEstimate.toFixed(2)} est (${epsDiffStr})`,
    });
  }

  // Revenue
  if (result.revenueActual != null && result.revenueEstimate != null) {
    const revDiff = ((result.revenueActual - result.revenueEstimate) / result.revenueEstimate) * 100;
    const revDiffStr = revDiff >= 0 ? `+${revDiff.toFixed(1)}% beat` : `${revDiff.toFixed(1)}% miss`;
    fields.push({
      name: "Revenue",
      value: `${formatLargeNumber(result.revenueActual)} vs ${formatLargeNumber(result.revenueEstimate)} est (${revDiffStr})`,
    });
  }

  const star = result.isWatchlist ? "⭐ " : "";

  return {
    title: `${emoji} ${star}${result.ticker} ${verb}${result.epsActual != null && result.epsEstimate != null ? ` — EPS $${result.epsActual.toFixed(2)} vs $${result.epsEstimate.toFixed(2)} est` : ""}`,
    color,
    fields,
    footer: { text: `Finnhub • ${getEasternTimeString()}` },
  };
}

// ── Weekly Preview ──────────────────────────────────────────────────

export function buildWeeklyEarningsPreviewEmbed(
  events: EarningsEvent[],
  watchlistTickers: Set<string>
): DiscordEmbed {
  // Group by date
  const byDate = new Map<string, EarningsEvent[]>();
  for (const e of events) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }

  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const fields = [];

  for (const [dateStr, dayEvents] of byDate) {
    const date = new Date(dateStr + "T12:00:00");
    const dayName = days[date.getDay()];
    const watchlistEvents = dayEvents.filter((e) => watchlistTickers.has(e.symbol));

    if (watchlistEvents.length > 0) {
      fields.push({
        name: `📌 ${dayName} (${dateStr})`,
        value: watchlistEvents
          .map((e) => `⭐ **${e.symbol}** (${e.hour === "bmo" ? "BMO" : e.hour === "amc" ? "AMC" : "TBD"})`)
          .join("\n"),
      });
    }
  }

  if (fields.length === 0) {
    fields.push({
      name: "No Watchlist Earnings",
      value: "No watchlist tickers reporting this week.",
    });
  }

  return {
    title: "💰 EARNINGS WEEK AHEAD",
    color: COLORS.BLUE,
    fields,
    footer: { text: `Finnhub • ${getEasternTimeString()}` },
  };
}
