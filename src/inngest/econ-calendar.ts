/**
 * Econ Calendar Module — #econ-calendar
 *
 * Schedule:
 *   5:00 AM ET (weekdays)  — Daily calendar post
 *   Every 1 min (6AM-4PM)  — Result drops (poll for actuals)
 *   8:00 PM ET Sunday      — Week-ahead preview
 */

import { inngest } from "./client";
import type { GetStepTools } from "inngest";
import { getTodaysReleases, getWeekReleases } from "@/lib/fred";
import { getFedEventsForDate, getFedEventsForWeek } from "@/lib/fed-calendar";
import { postEmbed } from "@/lib/discord";
import {
  buildDailyEconCalendarEmbed,
  buildWeeklyPreviewEmbed,
} from "@/lib/econ-embeds";
import { supabase } from "@/lib/supabase";
import {
  isMarketDay,
  isNearETTime,
  getEasternDateString,
  getEasternTime,
  etCronPair,
  etIntervalCronPair,
} from "@/lib/market-hours";
import type { EconEventRow } from "@/types/alerts";

// ── Shared helpers ──────────────────────────────────────────────────

async function logSuccess(action: string, details: Record<string, unknown>) {
  await supabase.from("bot_log").insert({
    module: "econ-calendar",
    action,
    details,
  });
}

function inferReleaseTime(name: string): string | null {
  const normalized = name.trim().toLowerCase();

  const releaseTimes: Record<string, string> = {
    "cpi": "08:30:00",
    "ppi": "08:30:00",
    "jobs report (nfp)": "08:30:00",
    "gdp": "08:30:00",
    "jobless claims": "08:30:00",
    "adp employment": "08:15:00",
    "pce inflation": "08:30:00",
    "employment cost index": "08:30:00",
    "retail sales": "08:30:00",
    "building permits": "08:30:00",
    "housing vacancies": "08:30:00",
    "fomc statement": "14:00:00",
    "gdpnow": "10:00:00",
  };

  return releaseTimes[normalized] ?? null;
}

/**
 * Fetch Finnhub + Fed calendar events for today, merge, and cache in Supabase.
 */
async function fetchAndCacheTodaysEvents(): Promise<EconEventRow[]> {
  const today = getEasternDateString();

  // Fetch from FRED + Fed calendar in parallel
  let fredReleases: Awaited<ReturnType<typeof getTodaysReleases>> = [];
  let fedEvents: Awaited<ReturnType<typeof getFedEventsForDate>> = [];

  try {
    [fredReleases, fedEvents] = await Promise.all([
      getTodaysReleases(today),
      getFedEventsForDate(today).catch(() => []),
    ]);
  } catch {
    // If FRED fails, try Fed calendar alone
    fedEvents = await getFedEventsForDate(today).catch(() => []);
  }

  const rows: Omit<EconEventRow, "id" | "created_at">[] = [];

  // Add FRED economic releases
  for (const r of fredReleases) {
    rows.push({
      event_date: today,
      event_time: inferReleaseTime(r.name),
      event_name: r.name,
      country: "US",
      impact: r.impact,
      forecast: null,
      previous: null,
      actual: null,
      is_fed_speech: r.name === "FOMC Statement",
      speaker_name: null,
      is_voting_member: null,
      alert_sent: false,
      result_posted: false,
    });
  }

  // Add Fed calendar events (speeches, testimony, etc.)
  for (const fed of fedEvents) {
    const alreadyExists = rows.some(
      (r) => r.event_name.toLowerCase().includes(fed.title.toLowerCase().split(" ")[0])
    );

    if (!alreadyExists) {
      rows.push({
        event_date: fed.date,
        event_time: fed.time,
        event_name: fed.title,
        country: "US",
        impact: "high",
        forecast: null,
        previous: null,
        actual: null,
        is_fed_speech: fed.type === "speech" || fed.type === "testimony",
        speaker_name: fed.speaker,
        is_voting_member: fed.isVotingMember,
        alert_sent: false,
        result_posted: false,
      });
    }
  }

  // Clear old events and insert new ones
  await supabase.from("econ_events").delete().eq("event_date", today);

  if (rows.length > 0) {
    await supabase.from("econ_events").insert(rows);
  }

  const { data } = await supabase
    .from("econ_events")
    .select("*")
    .eq("event_date", today)
    .order("event_time", { ascending: true, nullsFirst: false });

  return (data ?? []) as EconEventRow[];
}

// ── 5:00 AM ET — Daily Calendar Post ────────────────────────────────

const [daily500EDT, daily500EST] = etCronPair(5, 0);

export const econDailyCalendar = inngest.createFunction(
  {
    id: "econ-daily-calendar",
    retries: 3,
    triggers: [{ cron: daily500EDT }, { cron: daily500EST }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      return isNearETTime(5, 0);
    });
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };

    const events: EconEventRow[] = await step.run("fetch-and-cache", async () => {
      return fetchAndCacheTodaysEvents();
    });

    await step.run("post-calendar", async () => {
      const embed = buildDailyEconCalendarEmbed(events);
      await postEmbed("econ-calendar", embed);
    });

    await step.run("log-success", async () => {
      await logSuccess("daily-calendar", { eventCount: events.length });
    });

    return { posted: "daily-calendar", eventCount: events.length };
  }
);

// ── Every 1 min (6AM-4PM ET) — Result Drops ────────────────────────

const [alertsEDT, alertsEST] = etIntervalCronPair(1, 6, 16);

export const econAlertsEDT = inngest.createFunction(
  {
    id: "econ-alerts-edt",
    retries: 2,
    triggers: [{ cron: alertsEDT }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      // isEDT check — import inline to avoid circular
      const { isEDT } = await import("@/lib/market-hours");
      if (!isEDT()) return false;
      const { hour } = getEasternTime();
      return hour >= 6 && hour <= 16;
    });
    if (!shouldRun) return { skipped: true };

    const resultSummary = await checkResultDrops(step);

    return { checked: true, ...resultSummary };
  }
);

export const econAlertsEST = inngest.createFunction(
  {
    id: "econ-alerts-est",
    retries: 2,
    triggers: [{ cron: alertsEST }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      const { isEDT } = await import("@/lib/market-hours");
      if (isEDT()) return false;
      const { hour } = getEasternTime();
      return hour >= 6 && hour <= 16;
    });
    if (!shouldRun) return { skipped: true };

    const resultSummary = await checkResultDrops(step);

    return { checked: true, ...resultSummary };
  }
);

async function checkResultDrops(
  step: GetStepTools<typeof inngest>
): Promise<{ resultCandidates: number; resultsPosted: number }> {
  return step.run("check-results", async () => {
    const today = getEasternDateString();

    // Get events where actual is still null and event time has passed
    const { data: events } = await supabase
      .from("econ_events")
      .select("*")
      .eq("event_date", today)
      .eq("result_posted", false)
      .not("event_time", "is", null);

    if (!events || events.length === 0) {
      return { resultCandidates: 0, resultsPosted: 0 };
    }

    // FRED doesn't provide real-time actual values, so result drops
    // are not available in V1. Skip result checking.
    // TODO V2: Use BLS API to fetch actual CPI/NFP values after release.
    return { resultCandidates: events.length, resultsPosted: 0 };
  });
}

// ── Sunday 8 PM ET — Week-Ahead Preview ─────────────────────────────

const [weeklyEDT, weeklyEST] = etCronPair(20, 0, "0"); // Sunday = 0

export const econWeeklyPreview = inngest.createFunction(
  {
    id: "econ-weekly-preview",
    retries: 3,
    triggers: [{ cron: weeklyEDT }, { cron: weeklyEST }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      return isNearETTime(20, 0);
    });
    if (!shouldRun) return { skipped: true };

    // Get next week's Monday date
    const mondayDate: string = await step.run("get-monday", async () => {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = Sunday
      const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + daysUntilMonday);
      return monday.toISOString().split("T")[0];
    });

    const fridayDate = await step.run("get-friday", async () => {
      const mon = new Date(mondayDate + "T12:00:00");
      const fri = new Date(mon);
      fri.setDate(mon.getDate() + 4);
      return fri.toISOString().split("T")[0];
    });

    // Fetch week's events from FRED + Fed calendar
    const [econEvents, fedEvents] = await step.run("fetch-week-events", async () => {
      const [fredReleases, fed] = await Promise.all([
        getWeekReleases(mondayDate, fridayDate).catch(() => []),
        getFedEventsForWeek(mondayDate).catch(() => []),
      ]);

      // Convert FRED releases to EconEventRow shape for the embed builder
      const rows: EconEventRow[] = fredReleases.map((r, i) => ({
        id: i,
        event_date: r.date,
        event_time: null,
        event_name: r.name,
        country: "US",
        impact: r.impact,
        forecast: null,
        previous: null,
        actual: null,
        is_fed_speech: r.name === "FOMC Statement",
        speaker_name: null,
        is_voting_member: null,
        alert_sent: false,
        result_posted: false,
        created_at: new Date().toISOString(),
      }));

      return [rows, fed] as const;
    });

    await step.run("post-preview", async () => {
      const embed = buildWeeklyPreviewEmbed(econEvents, fedEvents.filter(Boolean) as Awaited<ReturnType<typeof getFedEventsForDate>>);
      await postEmbed("econ-calendar", embed);
    });

    await step.run("log-success", async () => {
      await logSuccess("weekly-preview", {
        econCount: econEvents.length,
        fedCount: fedEvents.length,
      });
    });

    return { posted: "weekly-preview" };
  }
);
