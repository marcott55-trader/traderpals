/**
 * Earnings Module — #earnings
 *
 * Schedule:
 *   5:15 AM ET (weekdays)    — Daily earnings calendar
 *   6:00 AM ET (weekdays)    — Pre-report alert (BMO watchlist)
 *   3:30 PM ET (weekdays)    — Pre-report alert (AMC watchlist)
 *   Every 30 min (5-9 AM)    — Result tracking (BMO window)
 *   Every 30 min (4-8 PM)    — Result tracking (AMC window)
 *   8:00 PM ET Sunday        — Week-ahead preview
 */

import { inngest } from "./client";
import { getEarningsCalendar } from "@/lib/finnhub";
import { postEmbed } from "@/lib/discord";
import {
  buildDailyEarningsEmbed,
  buildPreReportAlertEmbed,
  buildEarningsResultEmbed,
  buildWeeklyEarningsPreviewEmbed,
} from "@/lib/earnings-embeds";
import { supabase } from "@/lib/supabase";
import {
  isMarketDay,
  isNearETTime,
  getEasternDateString,
  getEasternTime,
  etCron,
  etIntervalCron,
} from "@/lib/market-hours";
import type { EarningsResult } from "@/types/alerts";

// ── Shared helpers ──────────────────────────────────────────────────

async function getWatchlistTickers(): Promise<Set<string>> {
  const { data } = await supabase.from("watchlist").select("ticker");
  return new Set((data ?? []).map((r) => r.ticker));
}

async function logSuccess(action: string, details: Record<string, unknown>) {
  await supabase.from("bot_log").insert({
    module: "earnings",
    action,
    details,
  });
}

// ── 5:15 AM ET — Daily Earnings Calendar ────────────────────────────

const daily515Cron = etCron(5, 15);

export const earningsDailyCalendar = inngest.createFunction(
  {
    id: "earnings-daily-calendar",
    retries: 3,
    triggers: [{ cron: daily515Cron }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      return isNearETTime(5, 15);
    });
    if (!shouldRun) return { skipped: true };

    const today = getEasternDateString();

    const [events, watchlist] = await step.run("fetch-data", async () => {
      const [cal, wl] = await Promise.all([
        getEarningsCalendar(today, today),
        getWatchlistTickers(),
      ]);
      return [cal, Array.from(wl)] as const;
    });

    const watchlistSet = new Set(watchlist);
    const bmo = events.filter((e) => e.hour === "bmo");
    const amc = events.filter((e) => e.hour === "amc");

    // Sort: watchlist tickers first
    const sortByWatchlist = (a: typeof events[0], b: typeof events[0]) =>
      (watchlistSet.has(b.symbol) ? 1 : 0) - (watchlistSet.has(a.symbol) ? 1 : 0);
    bmo.sort(sortByWatchlist);
    amc.sort(sortByWatchlist);

    await step.run("post-calendar", async () => {
      const embed = buildDailyEarningsEmbed(bmo, amc, watchlistSet);
      await postEmbed("earnings", embed);
    });

    // Track expected earnings in dedup table
    await step.run("cache-earnings", async () => {
      const rows = events
        .filter((e) => watchlistSet.has(e.symbol))
        .map((e) => ({
          ticker: e.symbol,
          report_date: today,
          result_posted: false,
        }));

      if (rows.length > 0) {
        await supabase.from("posted_earnings").upsert(rows, {
          onConflict: "ticker,report_date",
        });
      }
    });

    await step.run("log-success", async () => {
      await logSuccess("daily-calendar", { bmo: bmo.length, amc: amc.length });
    });

    return { posted: "daily-calendar", bmo: bmo.length, amc: amc.length };
  }
);

// ── 6:00 AM ET — BMO Pre-Report Alert ──────────────────────────────

const bmo600Cron = etCron(6, 0);

export const earningsBMOAlert = inngest.createFunction(
  {
    id: "earnings-bmo-alert",
    retries: 3,
    triggers: [{ cron: bmo600Cron }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      return isNearETTime(6, 0);
    });
    if (!shouldRun) return { skipped: true };

    const today = getEasternDateString();

    const watchlistBMO = await step.run("fetch-bmo-watchlist", async () => {
      const [events, watchlist] = await Promise.all([
        getEarningsCalendar(today, today),
        getWatchlistTickers(),
      ]);
      return events.filter((e) => e.hour === "bmo" && watchlist.has(e.symbol));
    });

    if (watchlistBMO.length === 0) return { skipped: true, reason: "no watchlist BMO" };

    await step.run("post-alert", async () => {
      const embed = buildPreReportAlertEmbed(watchlistBMO, "BMO");
      await postEmbed("earnings", embed);
    });

    return { posted: "bmo-alert", count: watchlistBMO.length };
  }
);

// ── 3:30 PM ET — AMC Pre-Report Alert ──────────────────────────────

const amc330Cron = etCron(15, 30);

export const earningsAMCAlert = inngest.createFunction(
  {
    id: "earnings-amc-alert",
    retries: 3,
    triggers: [{ cron: amc330Cron }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      return isNearETTime(15, 30);
    });
    if (!shouldRun) return { skipped: true };

    const today = getEasternDateString();

    const watchlistAMC = await step.run("fetch-amc-watchlist", async () => {
      const [events, watchlist] = await Promise.all([
        getEarningsCalendar(today, today),
        getWatchlistTickers(),
      ]);
      return events.filter((e) => e.hour === "amc" && watchlist.has(e.symbol));
    });

    if (watchlistAMC.length === 0) return { skipped: true, reason: "no watchlist AMC" };

    await step.run("post-alert", async () => {
      const embed = buildPreReportAlertEmbed(watchlistAMC, "AMC");
      await postEmbed("earnings", embed);
    });

    return { posted: "amc-alert", count: watchlistAMC.length };
  }
);

// ── Every 30 min (5-9 AM) — BMO Result Tracking ────────────────────

const bmResultsCron = etIntervalCron(30, 5, 9);

export const earningsBMOResults = inngest.createFunction(
  {
    id: "earnings-bmo-results",
    retries: 2,
    triggers: [{ cron: bmResultsCron }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      const { hour } = getEasternTime();
      return hour >= 5 && hour <= 9;
    });
    if (!shouldRun) return { skipped: true };
    return checkEarningsResults(step);
  }
);

// ── Every 30 min (4-8 PM) — AMC Result Tracking ────────────────────

const amcResultsCron = etIntervalCron(30, 16, 20);

export const earningsAMCResults = inngest.createFunction(
  {
    id: "earnings-amc-results",
    retries: 2,
    triggers: [{ cron: amcResultsCron }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      const { hour } = getEasternTime();
      return hour >= 16 && hour <= 20;
    });
    if (!shouldRun) return { skipped: true };
    return checkEarningsResults(step);
  }
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkEarningsResults(step: any) {
  const today = getEasternDateString();

  const summary = await step.run("check-results", async () => {
    // Get pending earnings for today
    const { data: pending } = await supabase
      .from("posted_earnings")
      .select("*")
      .eq("report_date", today)
      .eq("result_posted", false);

    if (!pending || pending.length === 0) {
      return { pendingCount: 0, resultsPosted: 0, readyCount: 0 };
    }

    const watchlist = await getWatchlistTickers();

    // Fetch fresh earnings data from Finnhub
    const freshEarnings = await getEarningsCalendar(today, today);
    const freshByTicker = new Map(
      freshEarnings.map((e) => [e.symbol, e])
    );

    const posted: EarningsResult[] = [];
    let readyCount = 0;

    for (const row of pending) {
      const fresh = freshByTicker.get(row.ticker);
      if (!fresh || fresh.epsActual == null) continue;
      readyCount += 1;

      const isBeat = fresh.epsEstimate != null
        ? fresh.epsActual >= fresh.epsEstimate
        : null;

      const result: EarningsResult = {
        ticker: row.ticker,
        epsActual: fresh.epsActual,
        epsEstimate: fresh.epsEstimate,
        revenueActual: fresh.revenueActual,
        revenueEstimate: fresh.revenueEstimate,
        hour: fresh.hour,
        reportDate: today,
        isBeat,
        isWatchlist: watchlist.has(row.ticker),
      };

      // Post result embed
      const embed = buildEarningsResultEmbed(result);
      await postEmbed("earnings", embed);

      // Mark as posted
      await supabase
        .from("posted_earnings")
        .update({ result_posted: true })
        .eq("ticker", row.ticker)
        .eq("report_date", today);

      await logSuccess("result", { ticker: row.ticker, isBeat });
      posted.push(result);
    }

    return {
      pendingCount: pending.length,
      readyCount,
      resultsPosted: posted.length,
    };
  });

  return { checked: true, ...summary };
}

// ── Sunday 8 PM ET — Week-Ahead Preview ─────────────────────────────

const weeklyCron = etCron(20, 0, "0"); // Sunday

export const earningsWeeklyPreview = inngest.createFunction(
  {
    id: "earnings-weekly-preview",
    retries: 3,
    triggers: [{ cron: weeklyCron }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      return isNearETTime(20, 0);
    });
    if (!shouldRun) return { skipped: true };

    const [events, watchlist] = await step.run("fetch-week", async () => {
      const now = new Date();
      const daysUntilMonday = now.getDay() === 0 ? 1 : 8 - now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() + daysUntilMonday);
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);

      const from = monday.toISOString().split("T")[0];
      const to = friday.toISOString().split("T")[0];

      const [cal, wl] = await Promise.all([
        getEarningsCalendar(from, to),
        getWatchlistTickers(),
      ]);

      return [cal, Array.from(wl)] as const;
    });

    await step.run("post-preview", async () => {
      const embed = buildWeeklyEarningsPreviewEmbed(events, new Set(watchlist));
      await postEmbed("earnings", embed);
    });

    return { posted: "weekly-preview", count: events.length };
  }
);
