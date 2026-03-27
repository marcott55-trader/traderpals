/**
 * Flow / Sentiment Module — #flow
 *
 * V1 (free data):
 *   6:00 PM ET (weekdays)   — Daily short volume from FINRA
 *   Every 30 min (24/7)     — Reddit sentiment scan
 *   Sunday 8:00 PM ET       — Weekly short squeeze watchlist
 *
 * V2 (paid, not yet implemented):
 *   Options flow via Polygon Starter
 *   Dark pool prints via Unusual Whales
 */

import { inngest } from "./client";
import { postEmbed } from "@/lib/discord";
import { supabase } from "@/lib/supabase";
import { fetchShortVolume } from "@/lib/finra";
import { scanRedditMentions, saveRedditMentionLog } from "@/lib/reddit";
import {
  isMarketDay,
  isNearETTime,
  etCronPair,
  getFormattedDate,
} from "@/lib/market-hours";
import { COLORS, formatVolume } from "@/lib/embeds";
import type { DiscordEmbed } from "@/types/market";
import type { RedditMention } from "@/types/alerts";

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

// ── 6:00 PM ET — Daily Short Volume (FINRA) ─────────────────────────

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

    const posted = await step.run("fetch-and-post", async () => {
      const tickers = await getWatchlistTickers();
      const shortData = await fetchShortVolume(tickers);

      if (shortData.length === 0) return false;

      // Only show tickers with notable short volume (> 30%)
      const notable = shortData.filter((d) => d.shortPercent > 30);
      if (notable.length === 0) return false;

      const lines = notable.slice(0, 15).map((d, i) => {
        const pct = d.shortPercent.toFixed(1);
        const emoji = d.shortPercent > 50 ? "🔴" : d.shortPercent > 40 ? "🟡" : "🟢";
        return `${i + 1}. ${emoji} **${d.ticker}**  ${pct}% short  Vol: ${formatVolume(d.totalVolume)}`;
      });

      const embed: DiscordEmbed = {
        title: `📉 SHORT VOLUME — ${getFormattedDate()}`,
        color: COLORS.PURPLE,
        fields: [{
          name: "Watchlist Short Volume (FINRA)",
          value: lines.join("\n"),
        }],
        footer: { text: "FINRA RegSHO • Previous trading day" },
      };

      await postEmbed("flow", embed);
      return true;
    });

    await step.run("log", async () => {
      await logSuccess("short-volume", { posted });
    });

    return { posted };
  }
);

// ── Every 30 min — Reddit Sentiment Scan ────────────────────────────

export const flowRedditScan = inngest.createFunction(
  {
    id: "flow-reddit-scan",
    retries: 1,
    triggers: [{ cron: "*/30 * * * *" }],
  },
  async ({ step }) => {
    // Skip if Reddit credentials aren't configured
    const hasCredentials: boolean = await step.run("check-credentials", async () => {
      return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
    });
    if (!hasCredentials) return { skipped: true, reason: "Reddit credentials not configured" };

    const result = await step.run("scan-reddit", async () => {
      const tickers = await getWatchlistTickers();
      const mentions = await scanRedditMentions(tickers);

      // Save raw counts for 7-day average calculation
      const mentionMap = new Map<string, number>();
      for (const m of mentions) {
        mentionMap.set(m.ticker, m.mentions24h);
      }
      await saveRedditMentionLog(mentionMap);

      // Only post spikes (3x+ above 7-day average, minimum 10 mentions)
      const spikes = mentions.filter(
        (m) => m.spikeMultiple >= 3 && m.mentions24h >= 10
      );

      if (spikes.length === 0) return { posted: 0, scanned: mentions.length };

      const lines = spikes.slice(0, 10).map((m) => formatRedditLine(m));

      const embed: DiscordEmbed = {
        title: "📱 REDDIT BUZZ — Watchlist Spikes",
        color: COLORS.PURPLE,
        fields: [{
          name: "Unusual Mention Activity (24h)",
          value: lines.join("\n"),
        }],
        footer: { text: "Reddit r/wallstreetbets + r/stocks + r/options" },
      };

      await postEmbed("flow", embed);
      return { posted: spikes.length, scanned: mentions.length };
    });

    await step.run("log", async () => {
      await logSuccess("reddit-scan", result);
    });

    return result;
  }
);

function formatRedditLine(m: RedditMention): string {
  const spike = m.spikeMultiple.toFixed(1);
  const emoji = m.spikeMultiple >= 5 ? "🔥" : "📈";
  return `${emoji} **${m.ticker}**  ${m.mentions24h} mentions (${spike}x avg)`;
}

// ── Sunday 8 PM ET — Weekly Short Squeeze Watchlist ─────────────────

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

    const posted = await step.run("build-squeeze-list", async () => {
      const tickers = await getWatchlistTickers();
      const shortData = await fetchShortVolume(tickers);

      // Squeeze candidates: high short volume (> 40%)
      const candidates = shortData.filter((d) => d.shortPercent > 40);
      if (candidates.length === 0) return false;

      const lines = candidates.slice(0, 10).map((d, i) => {
        return `${i + 1}. **${d.ticker}**  ${d.shortPercent.toFixed(1)}% short  Vol: ${formatVolume(d.totalVolume)}`;
      });

      const embed: DiscordEmbed = {
        title: "🎯 WEEKLY SQUEEZE WATCHLIST",
        color: COLORS.PURPLE,
        fields: [{
          name: "High Short Volume Tickers",
          value: lines.join("\n"),
        }],
        footer: { text: "FINRA short volume • Watch for short covering rallies" },
      };

      await postEmbed("flow", embed);
      return true;
    });

    await step.run("log", async () => {
      await logSuccess("weekly-squeeze", { posted });
    });

    return { posted };
  }
);
