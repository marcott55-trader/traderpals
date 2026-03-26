/**
 * Flow / Sentiment Module — #flow
 *
 * V1 (free data only):
 *   Every 15 min (9AM-4PM, weekdays)  — Options volume scan (placeholder)
 *   Every 30 min (24/7)               — Reddit sentiment scan (placeholder)
 *   6:00 PM ET (weekdays)             — Daily short interest summary
 *   7:00 AM ET (weekdays)             — Dark pool summary (placeholder)
 *   8:00 PM ET Sunday                 — Weekly short squeeze watchlist
 *
 * Note: Options flow and Reddit sentiment require external data that may be
 * limited in free tiers. These functions are scaffolded for V1 and will be
 * enhanced in V2 with paid data sources.
 */

import { inngest } from "./client";
import { getQuote } from "@/lib/finnhub";
import { postEmbed, logToDiscord } from "@/lib/discord";
import { buildShortInterestEmbed } from "@/lib/alerts-embeds";
import { supabase } from "@/lib/supabase";
import {
  isMarketDay,
  isNearETTime,
  isEDT,
  getEasternTime,
  etCronPair,
  etIntervalCronPair,
} from "@/lib/market-hours";
import type { ShortInterestData } from "@/types/alerts";

// ── Shared helpers ──────────────────────────────────────────────────

async function getWatchlistTickers(): Promise<string[]> {
  const { data } = await supabase.from("watchlist").select("ticker");
  return (data ?? []).map((r) => r.ticker);
}

async function logSuccess(action: string, details: Record<string, unknown>) {
  await supabase.from("bot_log").insert({
    module: "flow",
    action,
    details,
  });
}

// ── 6:00 PM ET — Daily Short Interest Summary ──────────────────────
// Uses Finnhub short interest data (updated bi-monthly by FINRA)

const [si6pmEDT, si6pmEST] = etCronPair(18, 0);

export const flowShortInterest = inngest.createFunction(
  {
    id: "flow-short-interest",
    retries: 3,
    triggers: [{ cron: si6pmEDT }, { cron: si6pmEST }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      return isNearETTime(18, 0);
    });
    if (!shouldRun) return { skipped: true };

    const shortData: ShortInterestData[] = await step.run("fetch-short-interest", async () => {
      const tickers = await getWatchlistTickers();
      const results: ShortInterestData[] = [];

      // Finnhub free tier doesn't have a direct short interest endpoint.
      // For V1, we use placeholder data structure — in V2 this would
      // call Finnhub premium or FINRA CSV files.
      //
      // For now, log that this is a V2 feature and skip.
      await logToDiscord("flow", "Short interest scan — V1 placeholder. Upgrade to V2 for real data.");

      return results;
    });

    if (shortData.length > 0) {
      await step.run("post-summary", async () => {
        const embed = buildShortInterestEmbed(shortData);
        await postEmbed("flow", embed);
      });
    }

    await step.run("log", async () => {
      await logSuccess("short-interest", { count: shortData.length });
    });

    return { posted: shortData.length > 0, count: shortData.length };
  }
);

// ── Every 15 min (9AM-4PM) — Options Volume Scan (V1 Placeholder) ──

const [optionsEDT, optionsEST] = etIntervalCronPair(15, 9, 16);

export const flowOptionsScanEDT = inngest.createFunction(
  {
    id: "flow-options-scan-edt",
    retries: 1,
    triggers: [{ cron: optionsEDT }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay() || !isEDT()) return false;
      const { hour } = getEasternTime();
      return hour >= 9 && hour <= 16;
    });
    if (!shouldRun) return { skipped: true };

    // V1: Options volume data requires Yahoo Finance options chains or
    // a paid provider. Scaffold the function for V2 integration.
    await step.run("options-scan-v1", async () => {
      // TODO V2: Fetch options chains via yfinance or Polygon Starter ($29/mo)
      // For each watchlist ticker:
      // 1. Fetch options chain for nearest expiry
      // 2. Calculate total call volume vs put volume
      // 3. Compare volume to open interest
      // 4. Flag unusual activity (volume > 3x OI)
    });

    return { skipped: true, reason: "V1 placeholder — options data not yet integrated" };
  }
);

export const flowOptionsScanEST = inngest.createFunction(
  {
    id: "flow-options-scan-est",
    retries: 1,
    triggers: [{ cron: optionsEST }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay() || isEDT()) return false;
      const { hour } = getEasternTime();
      return hour >= 9 && hour <= 16;
    });
    if (!shouldRun) return { skipped: true };
    return { skipped: true, reason: "V1 placeholder" };
  }
);

// ── Every 30 min — Reddit Sentiment Scan (V1 Placeholder) ──────────

export const flowRedditScan = inngest.createFunction(
  {
    id: "flow-reddit-scan",
    retries: 1,
    triggers: [{ cron: "*/30 * * * *" }], // Every 30 min, 24/7
  },
  async ({ step }) => {
    // V1: Reddit API requires OAuth app registration.
    // Scaffold for V2 integration.
    await step.run("reddit-scan-v1", async () => {
      // TODO V2: Implement Reddit API client
      // 1. Fetch hot posts from r/wallstreetbets, r/stocks
      // 2. Extract ticker mentions from titles and top comments
      // 3. Filter false positives (common words matching tickers)
      // 4. Compare to 7-day rolling average
      // 5. Alert on 3x spike
    });

    return { skipped: true, reason: "V1 placeholder — Reddit API not yet integrated" };
  }
);

// ── Sunday 8 PM ET — Weekly Short Squeeze Watchlist (V1 Placeholder) ─

const [weeklySIEDT, weeklySIEST] = etCronPair(20, 0, "0");

export const flowWeeklySqueezeWatch = inngest.createFunction(
  {
    id: "flow-weekly-squeeze-watch",
    retries: 3,
    triggers: [{ cron: weeklySIEDT }, { cron: weeklySIEST }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      return isNearETTime(20, 0);
    });
    if (!shouldRun) return { skipped: true };

    // V1 placeholder — same as short interest but weekly
    return { skipped: true, reason: "V1 placeholder" };
  }
);
