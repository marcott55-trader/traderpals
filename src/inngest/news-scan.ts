/**
 * News Module — #news
 *
 * Schedule:
 *   Every 5 min (5AM-8PM, weekdays)   — Company news scan
 *   Every 10 min (5AM-8PM, weekdays)  — Macro/general news scan
 */

import { inngest } from "./client";
import { getCompanyNews, getGeneralNews } from "@/lib/finnhub";
import { logToDiscord, postEmbed } from "@/lib/discord";
import { buildNewsEmbed } from "@/lib/news-embeds";
import {
  scoreHeadline,
  generateNewsId,
  isFuzzyDuplicate,
  shouldPost,
} from "@/lib/news-scoring";
import {
  buildClusterId,
  isStoryAlreadyPosted,
  markStoryPosted,
} from "@/lib/story-clustering";
import { supabase } from "@/lib/supabase";
import {
  isMarketDay,
  isEDT,
  getEasternTime,
  getEasternDateString,
  etIntervalCronPair,
} from "@/lib/market-hours";
import type { ScoredArticle } from "@/types/news";
import { NEWS_MAX_PER_CYCLE } from "@/types/news";

// ── Shared helpers ──────────────────────────────────────────────────

async function getWatchlistMap(): Promise<Map<string, string>> {
  const { data } = await supabase.from("watchlist").select("ticker, tier");
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.ticker, row.tier);
  }
  return map;
}

async function isAlreadyPosted(newsId: string): Promise<boolean> {
  const { data } = await supabase
    .from("posted_news")
    .select("news_id")
    .eq("news_id", newsId)
    .limit(1);
  return (data ?? []).length > 0;
}

async function getRecentHeadlines(channel: string, minutes: number = 30): Promise<string[]> {
  const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("posted_news")
    .select("headline")
    .eq("channel", channel)
    .gte("posted_at", cutoff);
  return (data ?? []).map((r) => r.headline).filter(Boolean) as string[];
}

async function markAsPosted(
  newsId: string,
  ticker: string | null,
  category: string,
  channel: string,
  headline: string
) {
  await supabase.from("posted_news").insert({
    news_id: newsId,
    ticker,
    category,
    channel,
    headline,
  });
}

async function logSuccess(action: string, details: Record<string, unknown>) {
  await supabase.from("bot_log").insert({
    module: "news",
    action,
    details,
  });
}

async function logScanSummary(
  action: "company-scan" | "macro-scan",
  summary: Record<string, unknown>
) {
  await logSuccess(action, summary);

  const posted = typeof summary.posted === "number" ? summary.posted : 0;
  if (posted === 0) {
    const details = Object.entries(summary)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(" ");
    await logToDiscord("news", `${action} produced no posts: ${details}`);
  }
}

function getPreviousEasternDateString(): string {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  now.setDate(now.getDate() - 1);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getEffectiveLookbackMinutes(defaultMinutes: number): number {
  const { hour, minute } = getEasternTime();
  const minutesSinceMidnight = hour * 60 + minute;

  // During premarket, include the full overnight session from the prior close.
  if (minutesSinceMidnight < 570) {
    return Math.max(defaultMinutes, 18 * 60);
  }

  return defaultMinutes;
}

function getPrioritizedTickersForCycle(watchlist: Map<string, string>): string[] {
  const entries = Array.from(watchlist.entries()).sort((a, b) => {
    const priority = { tier1: 0, tier2: 1, futures: 2, custom: 3 };
    const aRank = priority[a[1] as keyof typeof priority] ?? 9;
    const bRank = priority[b[1] as keyof typeof priority] ?? 9;
    if (aRank !== bRank) return aRank - bRank;
    return a[0].localeCompare(b[0]);
  });

  const core = entries
    .filter(([, tier]) => tier === "tier1")
    .map(([ticker]) => ticker)
    .slice(0, 8);

  const remainder = entries
    .filter(([ticker]) => !core.includes(ticker))
    .map(([ticker]) => ticker);

  if (remainder.length === 0) return core;

  const rotationSize = 6;
  const slot = Math.floor(Date.now() / (5 * 60 * 1000));
  const offset = (slot * rotationSize) % remainder.length;
  const rotated = remainder
    .slice(offset, offset + rotationSize)
    .concat(remainder.slice(0, Math.max(0, offset + rotationSize - remainder.length)));

  return Array.from(new Set([...core, ...rotated]));
}

// ── Every 5 min (5AM-8PM) — Company News Scan ──────────────────────

const [companyEDT, companyEST] = etIntervalCronPair(5, 5, 20);

export const newsCompanyScanEDT = inngest.createFunction(
  {
    id: "news-company-scan-edt",
    retries: 2,
    triggers: [{ cron: companyEDT }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay() || !isEDT()) return false;
      const { hour } = getEasternTime();
      return hour >= 5 && hour <= 20;
    });
    if (!shouldRun) return { skipped: true };
    return scanCompanyNews(step);
  }
);

export const newsCompanyScanEST = inngest.createFunction(
  {
    id: "news-company-scan-est",
    retries: 2,
    triggers: [{ cron: companyEST }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay() || isEDT()) return false;
      const { hour } = getEasternTime();
      return hour >= 5 && hour <= 20;
    });
    if (!shouldRun) return { skipped: true };
    return scanCompanyNews(step);
  }
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function scanCompanyNews(step: any) {
  const summary = await step.run("scan-company-news", async () => {
    const watchlist = await getWatchlistMap();
    const today = getEasternDateString();
    const previousDate = getPreviousEasternDateString();
    const recentHeadlines = await getRecentHeadlines("news");
    let postedCount = 0;
    let scannedCount = 0;
    let scoreRejected = 0;
    let dedupRejected = 0;

    // Read lookback window from config (default 60 min)
    const { data: cfgRows } = await supabase
      .from("bot_config")
      .select("value")
      .eq("key", "news.lookback_minutes")
      .limit(1);
    const configuredLookback = parseInt(cfgRows?.[0]?.value ?? "60", 10);
    const lookbackMinutes = getEffectiveLookbackMinutes(configuredLookback);
    const lookbackCutoff = Math.floor(Date.now() / 1000) - lookbackMinutes * 60;

    // Always cover core tier1 names, then rotate the rest.
    const tickers = getPrioritizedTickersForCycle(watchlist);

    // Process tickers
    for (let i = 0; i < tickers.length; i += 4) {
      const batch = tickers.slice(i, i + 4);

      const newsResults = await Promise.allSettled(
        batch.map((ticker) => getCompanyNews(ticker, previousDate, today))
      );

      for (let j = 0; j < batch.length; j++) {
        const result = newsResults[j];
        if (result.status === "rejected") continue;

        const ticker = batch[j];
        const articles = result.value;

        for (const article of articles) {
          scannedCount++;

          // Skip articles older than 30 minutes
          if (article.datetime < lookbackCutoff) continue;

          // Stop if we've hit the per-cycle cap
          if (postedCount >= NEWS_MAX_PER_CYCLE) break;

          const newsId = generateNewsId(article.headline, article.source);

          // Dedup: exact hash
          if (await isAlreadyPosted(newsId)) {
            dedupRejected++;
            continue;
          }

          // Dedup: fuzzy match against recent posts
          if (recentHeadlines.some((h) => isFuzzyDuplicate(h, article.headline))) {
            dedupRejected++;
            continue;
          }

          // Story-level dedup: same event cluster already posted in last 4 hours?
          const clusterId = buildClusterId(article.headline);
          if (await isStoryAlreadyPosted(clusterId, "news")) {
            dedupRejected++;
            continue;
          }

          // Score
          const relatedTickers = [ticker];
          if (article.related) {
            relatedTickers.push(...article.related.split(",").map((t) => t.trim()));
          }

          const { score, tag, shouldReject } = scoreHeadline(
            article.headline,
            article.source,
            watchlist,
            relatedTickers
          );

          if (shouldReject || !shouldPost(score)) {
            scoreRejected++;
            continue;
          }

          const scored: ScoredArticle = {
            headline: article.headline,
            summary: article.summary,
            source: article.source,
            url: article.url,
            datetime: article.datetime,
            tickers: relatedTickers,
            score,
            category: "company",
            tag,
            newsId,
          };

          const embed = buildNewsEmbed(scored);
          await postEmbed("news", embed);
          await markAsPosted(newsId, ticker, "company", "news", article.headline);
          await markStoryPosted(clusterId, "news", article.headline);
          recentHeadlines.push(article.headline);
          postedCount++;
        }

        // Break out of ticker loop if cap hit
        if (postedCount >= NEWS_MAX_PER_CYCLE) break;
      }

      if (postedCount >= NEWS_MAX_PER_CYCLE) break;

      // Rate limit pause between batches
      if (i + 4 < tickers.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return {
      posted: postedCount,
      scanned: scannedCount,
      dedupRejected,
      scoreRejected,
      lookbackMinutes,
    };
  });

  await step.run("log", async () => {
    await logScanSummary("company-scan", summary);
  });

  return summary;
}

// ── Every 10 min (5AM-8PM) — Macro/General News ────────────────────

const [macroEDT, macroEST] = etIntervalCronPair(10, 5, 20);

export const newsMacroScanEDT = inngest.createFunction(
  {
    id: "news-macro-scan-edt",
    retries: 2,
    triggers: [{ cron: macroEDT }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay() || !isEDT()) return false;
      const { hour } = getEasternTime();
      return hour >= 5 && hour <= 20;
    });
    if (!shouldRun) return { skipped: true };
    return scanMacroNews(step);
  }
);

export const newsMacroScanEST = inngest.createFunction(
  {
    id: "news-macro-scan-est",
    retries: 2,
    triggers: [{ cron: macroEST }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay() || isEDT()) return false;
      const { hour } = getEasternTime();
      return hour >= 5 && hour <= 20;
    });
    if (!shouldRun) return { skipped: true };
    return scanMacroNews(step);
  }
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function scanMacroNews(step: any) {
  const summary = await step.run("scan-macro-news", async () => {
    const watchlist = await getWatchlistMap();
    const recentHeadlines = await getRecentHeadlines("news");
    let postedCount = 0;
    let scannedCount = 0;
    let scoreRejected = 0;
    let dedupRejected = 0;

    const articles = await getGeneralNews();
    const { data: cfgRows } = await supabase
      .from("bot_config")
      .select("value")
      .eq("key", "news.lookback_minutes")
      .limit(1);
    const configuredLookback = parseInt(cfgRows?.[0]?.value ?? "60", 10);
    const lookbackMin = getEffectiveLookbackMinutes(configuredLookback);
    const lookbackCutoff = Math.floor(Date.now() / 1000) - lookbackMin * 60;

    for (const article of articles) {
      scannedCount++;
      if (article.datetime < lookbackCutoff) continue;
      if (postedCount >= NEWS_MAX_PER_CYCLE) break;

      const newsId = generateNewsId(article.headline, article.source);
      if (await isAlreadyPosted(newsId)) {
        dedupRejected++;
        continue;
      }
      if (recentHeadlines.some((h) => isFuzzyDuplicate(h, article.headline))) {
        dedupRejected++;
        continue;
      }

      // Story-level dedup
      const clusterId = buildClusterId(article.headline);
      if (await isStoryAlreadyPosted(clusterId, "news")) {
        dedupRejected++;
        continue;
      }

      // Extract related tickers from the related field
      const relatedTickers = article.related
        ? article.related.split(",").map((t) => t.trim()).filter(Boolean)
        : [];

      const { score, tag, shouldReject } = scoreHeadline(
        article.headline,
        article.source,
        watchlist,
        relatedTickers
      );

      if (shouldReject || !shouldPost(score)) {
        scoreRejected++;
        continue;
      }

      const scored: ScoredArticle = {
        headline: article.headline,
        summary: article.summary,
        source: article.source,
        url: article.url,
        datetime: article.datetime,
        tickers: relatedTickers,
        score,
        category: "macro",
        tag,
        newsId,
      };

      const embed = buildNewsEmbed(scored);
      await postEmbed("news", embed);
      await markAsPosted(newsId, relatedTickers[0] ?? null, "macro", "news", article.headline);
      await markStoryPosted(clusterId, "news", article.headline);
      recentHeadlines.push(article.headline);
      postedCount++;
    }

    return {
      posted: postedCount,
      scanned: scannedCount,
      dedupRejected,
      scoreRejected,
      lookbackMinutes: lookbackMin,
    };
  });

  await step.run("log", async () => {
    await logScanSummary("macro-scan", summary);
  });

  return summary;
}
