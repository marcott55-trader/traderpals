/**
 * Econ Calendar Module — #econ-calendar
 *
 * Schedule:
 *   5:00 AM ET (weekdays)  — Daily calendar post
 *   Every 30 min (6AM-8PM) — Enhanced Fed speaker reminders
 *   8:00 PM ET Sunday      — Week-ahead preview
 */

import { inngest } from "./client";
import type { GetStepTools } from "inngest";
import { getTodaysReleases, getWeekReleases } from "@/lib/fred";
import { getFedEventsForDate, getFedEventsForWeek } from "@/lib/fed-calendar";
import { getEconomicCalendar } from "@/lib/finnhub";
import { postEmbed } from "@/lib/discord";
import {
  buildDailyEconCalendarEmbed,
  buildPreEventAlertEmbed,
  buildWeeklyPreviewEmbed,
} from "@/lib/econ-embeds";
import { supabase } from "@/lib/supabase";
import {
  isMarketDay,
  isNearETTime,
  getEasternDateString,
  getEasternTime,
  isWithinETWindow,
  etCron,
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

function timeToMinutes(value: string | null): number | null {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function isEnhancedFedSpeakerEvent(event: EconEventRow): boolean {
  if (!event.is_fed_speech) return false;
  const speaker = event.speaker_name?.toLowerCase() ?? "";

  if (speaker.includes("powell")) return true;

  return [
    "jefferson",
    "williams",
    "waller",
    "barkin",
    "daly",
  ].some((name) => speaker.includes(name));
}

function normalizeEventName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getFinnhubNameCandidates(name: string): string[] {
  const normalized = normalizeEventName(name);

  const aliases: Record<string, string[]> = {
    "cpi": ["cpi", "consumer price index"],
    "ppi": ["ppi", "producer price index"],
    "jobs report": ["nonfarm payrolls", "payrolls", "jobs report", "nfp"],
    "gdp": ["gross domestic product", "gdp"],
    "jobless claims": ["jobless claims", "initial jobless claims", "unemployment claims"],
    "adp employment": ["adp employment", "adp nonfarm employment", "adp"],
    "pce inflation": ["pce", "personal consumption expenditures", "core pce"],
    "employment cost index": ["employment cost index", "eci"],
    "retail sales": ["retail sales"],
    "building permits": ["building permits"],
    "housing vacancies": ["housing vacancies"],
    "fomc statement": ["fomc", "interest rate decision", "fed interest rate decision"],
  };

  for (const [key, values] of Object.entries(aliases)) {
    if (normalized.includes(key)) return values;
  }

  return [normalized];
}

function findEconomicCalendarMatch(
  eventName: string,
  calendarEvents: Awaited<ReturnType<typeof getEconomicCalendar>>
) {
  const candidates = getFinnhubNameCandidates(eventName);
  const eventNameNormalized = normalizeEventName(eventName);

  return calendarEvents.find((event) => {
    const finnhubName = normalizeEventName(event.event);
    return candidates.some(
      (candidate) =>
        finnhubName.includes(candidate) ||
        candidate.includes(finnhubName) ||
        finnhubName.includes(eventNameNormalized)
    );
  });
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

  const rowsFromDb = (data ?? []) as EconEventRow[];

  try {
    const econCalendar = await getEconomicCalendar(today, today);

    for (const row of rowsFromDb) {
      const match = findEconomicCalendarMatch(row.event_name, econCalendar);
      if (!match) continue;

      await supabase
        .from("econ_events")
        .update({
          forecast: match.estimate,
          previous: match.prev,
          actual: match.actual,
        })
        .eq("id", row.id);

      row.forecast = match.estimate;
      row.previous = match.prev;
      row.actual = match.actual;
    }
  } catch {
    // Finnhub economic calendar is best-effort; daily schedule should still post.
  }

  return rowsFromDb;
}

// ── 5:00 AM ET — Daily Calendar Post ────────────────────────────────

const daily500Cron = etCron(5, 0);

export const econDailyCalendar = inngest.createFunction(
  {
    id: "econ-daily-calendar",
    retries: 3,
    triggers: [{ cron: daily500Cron }],
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

// ── Every 30 min (6AM-8PM ET) — Enhanced Fed Speaker Reminders ─────

const speakerAlertsCrons = [
  "TZ=America/New_York 0,30 6-19 * * 1-5",
  "TZ=America/New_York 0 20 * * 1-5",
];

export const econFedSpeakerAlerts = inngest.createFunction(
  {
    id: "econ-fed-speaker-alerts",
    retries: 2,
    triggers: speakerAlertsCrons.map((cron) => ({ cron })),
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      return isWithinETWindow(6, 0, 20, 0);
    });
    if (!shouldRun) return { skipped: true };

    const reminderSummary = await checkFedSpeakerReminders(step);

    return { checked: true, ...reminderSummary };
  }
);

async function checkFedSpeakerReminders(
  step: GetStepTools<typeof inngest>
): Promise<{ reminderCandidates: number; remindersPosted: number }> {
  return step.run("check-speaker-reminders", async () => {
    const today = getEasternDateString();
    const { data: events } = await supabase
      .from("econ_events")
      .select("*")
      .eq("event_date", today)
      .eq("alert_sent", false)
      .eq("is_fed_speech", true)
      .not("event_time", "is", null);

    if (!events || events.length === 0) {
      return { reminderCandidates: 0, remindersPosted: 0 };
    }

    let remindersPosted = 0;
    const { hour, minute } = getEasternTime();
    const nowMinutes = hour * 60 + minute;

    for (const event of events as EconEventRow[]) {
      if (!isEnhancedFedSpeakerEvent(event)) continue;

      const eventMinutes = timeToMinutes(event.event_time);
      if (eventMinutes == null) continue;

      const minutesUntil = eventMinutes - nowMinutes;
      if (minutesUntil < 0 || minutesUntil > 10) continue;

      await postEmbed("econ-calendar", buildPreEventAlertEmbed(event));

      await supabase
        .from("econ_events")
        .update({
          alert_sent: true,
        })
        .eq("id", event.id);

      await logSuccess("fed-speaker-reminder", {
        event: event.event_name,
        speaker: event.speaker_name,
        minutesUntil,
      });

      remindersPosted += 1;
    }

    return { reminderCandidates: events.length, remindersPosted };
  });
}

// ── Sunday 8 PM ET — Week-Ahead Preview ─────────────────────────────

const weeklyCron = etCron(20, 0, "0"); // Sunday = 0

export const econWeeklyPreview = inngest.createFunction(
  {
    id: "econ-weekly-preview",
    retries: 3,
    triggers: [{ cron: weeklyCron }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      return isNearETTime(20, 0);
    });
    if (!shouldRun) return { skipped: true };

    // Get next week's Monday date (use ET to avoid UTC-ahead-of-ET mismatch)
    const mondayDate: string = await step.run("get-monday", async () => {
      const now = new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
      );
      const dayOfWeek = now.getDay(); // 0 = Sunday
      const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + daysUntilMonday);
      const y = monday.getFullYear();
      const m = String(monday.getMonth() + 1).padStart(2, "0");
      const d = String(monday.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    });

    const fridayDate = await step.run("get-friday", async () => {
      const mon = new Date(mondayDate + "T12:00:00");
      const fri = new Date(mon);
      fri.setDate(mon.getDate() + 4);
      const y = fri.getFullYear();
      const m = String(fri.getMonth() + 1).padStart(2, "0");
      const d = String(fri.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
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
