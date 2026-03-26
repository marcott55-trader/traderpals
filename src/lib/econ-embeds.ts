/**
 * Embed builders for the Econ Calendar module.
 * Handles: daily calendar, pre-event alerts, result drops, weekly preview.
 */

import type { DiscordEmbed } from "@/types/market";
import type { EconEventRow } from "@/types/alerts";
import type { FedEvent } from "@/lib/fed-calendar";
import { COLORS, formatPrice } from "@/lib/embeds";
import { getEasternTimeString, getFormattedDate } from "@/lib/market-hours";

// ── Daily Calendar ──────────────────────────────────────────────────

export function buildDailyEconCalendarEmbed(
  events: EconEventRow[]
): DiscordEmbed {
  const high = events.filter((e) => e.impact === "high");
  const medium = events.filter((e) => e.impact === "medium");
  const low = events.filter((e) => e.impact === "low");

  const fields = [];

  if (high.length > 0) {
    fields.push({
      name: "🔴 HIGH IMPACT",
      value: high.map(formatCalendarLine).join("\n"),
    });
  }

  if (medium.length > 0) {
    fields.push({
      name: "🟡 MEDIUM IMPACT",
      value: medium.map(formatCalendarLine).join("\n"),
    });
  }

  if (low.length > 0) {
    fields.push({
      name: "🟢 LOW IMPACT",
      value: low.map(formatCalendarLine).join("\n"),
    });
  }

  if (fields.length === 0) {
    fields.push({
      name: "No Events",
      value: "No economic events scheduled for today.",
    });
  }

  return {
    title: `📅 ECONOMIC CALENDAR — ${getFormattedDate()}`,
    color: COLORS.BLUE,
    fields,
    footer: { text: `Finnhub + Fed Calendar • ${getEasternTimeString()}` },
  };
}

function formatCalendarLine(e: EconEventRow): string {
  const time = e.event_time ? formatEventTime(e.event_time) : "TBD";
  const fed = e.is_fed_speech ? " 🏛️" : "";
  const voter = e.is_voting_member ? " ★" : "";
  const speaker = e.speaker_name ? ` — ${e.speaker_name}${voter}` : "";
  const forecast = e.forecast ? ` | Est: ${e.forecast}` : "";
  const previous = e.previous ? ` | Prev: ${e.previous}` : "";

  return `**${time}** ${e.event_name}${fed}${speaker}${forecast}${previous}`;
}

function formatEventTime(time: string): string {
  // time is HH:MM format from DB
  const [h, m] = time.split(":").map(Number);
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm} ET`;
}

// ── Pre-Event Alert ─────────────────────────────────────────────────

export function buildPreEventAlertEmbed(event: EconEventRow): DiscordEmbed {
  const fields = [];
  const time = event.event_time ? formatEventTime(event.event_time) : "Soon";

  fields.push({ name: "Time", value: time, inline: true });

  if (event.is_fed_speech && event.speaker_name) {
    const voterTag = event.is_voting_member ? " — VOTING MEMBER" : "";
    fields.push({
      name: "Speaker",
      value: `${event.speaker_name}${voterTag}`,
      inline: true,
    });
  }

  if (event.forecast) {
    fields.push({ name: "Forecast", value: event.forecast, inline: true });
  }
  if (event.previous) {
    fields.push({ name: "Previous", value: event.previous, inline: true });
  }

  const emoji = event.is_fed_speech ? "🏛️" : "⏰";
  return {
    title: `${emoji} ${event.event_name} in 15 Minutes`,
    color: COLORS.YELLOW,
    fields,
    footer: { text: "⚠️ Expect volatility" },
  };
}

// ── Result Drop ─────────────────────────────────────────────────────

export function buildResultDropEmbed(event: EconEventRow): DiscordEmbed {
  const isBetter = isResultBetter(event);
  const color = isBetter === null ? COLORS.BLUE : isBetter ? COLORS.GREEN : COLORS.RED;
  const emoji = isBetter === null ? "📊" : isBetter ? "✅" : "🚨";

  const comparisonText = event.forecast
    ? ` (vs ${event.forecast} expected)`
    : "";

  const fields = [];
  fields.push({
    name: "Actual",
    value: `${event.actual}${isBetter === false ? " ⚠️" : ""}`,
    inline: true,
  });
  if (event.forecast) {
    fields.push({ name: "Forecast", value: event.forecast, inline: true });
  }
  if (event.previous) {
    fields.push({ name: "Previous", value: event.previous, inline: true });
  }

  return {
    title: `${emoji} ${event.event_name}: ${event.actual}${comparisonText}`,
    color,
    fields,
    footer: { text: `Finnhub • ${getEasternTimeString()}` },
  };
}

/**
 * Compare actual vs forecast. Returns true if "better" (lower for inflation,
 * higher for employment). Returns null if we can't determine.
 */
function isResultBetter(event: EconEventRow): boolean | null {
  if (!event.actual || !event.forecast) return null;

  const actual = parseFloat(event.actual.replace(/[%,]/g, ""));
  const forecast = parseFloat(event.forecast.replace(/[%,]/g, ""));
  if (isNaN(actual) || isNaN(forecast)) return null;

  const name = event.event_name.toLowerCase();

  // For inflation metrics, lower is better
  if (name.includes("cpi") || name.includes("ppi") || name.includes("pce") || name.includes("inflation")) {
    return actual <= forecast;
  }

  // For employment/GDP, higher is better
  if (name.includes("nfp") || name.includes("payroll") || name.includes("gdp") || name.includes("retail")) {
    return actual >= forecast;
  }

  // For jobless claims, lower is better
  if (name.includes("jobless") || name.includes("unemployment")) {
    return actual <= forecast;
  }

  return null;
}

// ── Weekly Preview ──────────────────────────────────────────────────

export function buildWeeklyPreviewEmbed(
  weekEvents: EconEventRow[],
  fedEvents: FedEvent[]
): DiscordEmbed {
  // Group by day
  const byDay = new Map<string, EconEventRow[]>();
  for (const e of weekEvents) {
    const day = e.event_date;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }

  const fields = [];
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  for (const [dateStr, events] of byDay) {
    const date = new Date(dateStr + "T12:00:00");
    const dayName = days[date.getDay() - 1] ?? dateStr;
    const highImpact = events.filter((e) => e.impact === "high");

    if (highImpact.length > 0) {
      fields.push({
        name: `📌 ${dayName}`,
        value: highImpact.map((e) => {
          const time = e.event_time ? formatEventTime(e.event_time) : "TBD";
          return `${time} — ${e.event_name}`;
        }).join("\n"),
      });
    }
  }

  // Add Fed events
  if (fedEvents.length > 0) {
    fields.push({
      name: "🏛️ FED EVENTS THIS WEEK",
      value: fedEvents.map((e) => {
        const voter = e.isVotingMember ? " ★" : "";
        const speaker = e.speaker ? ` — ${e.speaker}${voter}` : "";
        return `${e.date} ${e.title}${speaker}`;
      }).join("\n"),
    });
  }

  if (fields.length === 0) {
    fields.push({
      name: "Quiet Week",
      value: "No high-impact events scheduled.",
    });
  }

  return {
    title: "📅 WEEK AHEAD — Economic Calendar",
    color: COLORS.BLUE,
    fields,
    footer: { text: `Finnhub + Fed Calendar • ${getEasternTimeString()}` },
  };
}
