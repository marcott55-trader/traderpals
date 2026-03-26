/**
 * Earnings Module — #earnings
 *
 * Schedule:
 *   6:30 AM ET (weekdays)    — Daily earnings calendar
 *   6:15 AM ET (weekdays)    — Pre-report alert (BMO watchlist)
 *   3:45 PM ET (weekdays)    — Pre-report alert (AMC watchlist)
 *   Every 2 min (6-9 AM)     — Result tracking (BMO window)
 *   Every 2 min (4-8 PM)     — Result tracking (AMC window)
 *   8:00 PM ET Sunday        — Week-ahead preview
 */

import { inngest } from "./client";
import { getEarningsCalendar, getQuote } from "@/lib/finnhub";
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
  isEDT,
  getEasternDateString,
  getEasternTime,
  etCronPair,
  etIntervalCronPair,
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

// ── 6:30 AM ET — Daily Earnings Calendar ────────────────────────────

const [daily630EDT, daily630EST] = etCronPair(6, 30);

export const earningsDailyCalendar = inngest.createFunction(
  {
    id: "earnings-daily-calendar",
    retries: 3,
    triggers: [{ cron: daily630EDT }, { cron: daily630EST }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      return isNearETTime(6, 30);
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

// ── 6:15 AM ET — BMO Pre-Report Alert ──────────────────────────────

const [bmo615EDT, bmo615EST] = etCronPair(6, 15);

export const earningsBMOAlert = inngest.createFunction(
  {
    id: "earnings-bmo-alert",
    retries: 3,
    triggers: [{ cron: bmo615EDT }, { cron: bmo615EST }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      return isNearETTime(6, 15);
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

// ── 3:45 PM ET — AMC Pre-Report Alert ──────────────────────────────

const [amc345EDT, amc345EST] = etCronPair(15, 45);

export const earningsAMCAlert = inngest.createFunction(
  {
    id: "earnings-amc-alert",
    retries: 3,
    triggers: [{ cron: amc345EDT }, { cron: amc345EST }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      return isNearETTime(15, 45);
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

// ── Every 2 min (6-9 AM) — BMO Result Tracking ─────────────────────

const [bmResultsEDT, bmResultsEST] = etIntervalCronPair(2, 6, 9);

export const earningsBMOResultsEDT = inngest.createFunction(
  {
    id: "earnings-bmo-results-edt",
    retries: 2,
    triggers: [{ cron: bmResultsEDT }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay() || !isEDT()) return false;
      const { hour } = getEasternTime();
      return hour >= 6 && hour <= 9;
    });
    if (!shouldRun) return { skipped: true };
    return checkEarningsResults(step);
  }
);

export const earningsBMOResultsEST = inngest.createFunction(
  {
    id: "earnings-bmo-results-est",
    retries: 2,
    triggers: [{ cron: bmResultsEST }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay() || isEDT()) return false;
      const { hour } = getEasternTime();
      return hour >= 6 && hour <= 9;
    });
    if (!shouldRun) return { skipped: true };
    return checkEarningsResults(step);
  }
);

// ── Every 2 min (4-8 PM) — AMC Result Tracking ─────────────────────

const [amcResultsEDT, amcResultsEST] = etIntervalCronPair(2, 16, 20);

export const earningsAMCResultsEDT = inngest.createFunction(
  {
    id: "earnings-amc-results-edt",
    retries: 2,
    triggers: [{ cron: amcResultsEDT }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay() || !isEDT()) return false;
      const { hour } = getEasternTime();
      return hour >= 16 && hour <= 20;
    });
    if (!shouldRun) return { skipped: true };
    return checkEarningsResults(step);
  }
);

export const earningsAMCResultsEST = inngest.createFunction(
  {
    id: "earnings-amc-results-est",
    retries: 2,
    triggers: [{ cron: amcResultsEST }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay() || isEDT()) return false;
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

  const results = await step.run("check-results", async () => {
    // Get pending earnings for today
    const { data: pending } = await supabase
      .from("posted_earnings")
      .select("*")
      .eq("report_date", today)
      .eq("result_posted", false);

    if (!pending || pending.length === 0) return [];

    const watchlist = await getWatchlistTickers();

    // Fetch fresh earnings data from Finnhub
    const freshEarnings = await getEarningsCalendar(today, today);
    const freshByTicker = new Map(
      freshEarnings.map((e) => [e.symbol, e])
    );

    const posted: EarningsResult[] = [];

    for (const row of pending) {
      const fresh = freshByTicker.get(row.ticker);
      if (!fresh || fresh.epsActual == null) continue;

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

    return posted;
  });

  return { checked: true, resultsPosted: results.length };
}

// ── Sunday 8 PM ET — Week-Ahead Preview ─────────────────────────────

const [weeklyEDT, weeklyEST] = etCronPair(20, 0, "0"); // Sunday

export const earningsWeeklyPreview = inngest.createFunction(
  {
    id: "earnings-weekly-preview",
    retries: 3,
    triggers: [{ cron: weeklyEDT }, { cron: weeklyEST }],
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
