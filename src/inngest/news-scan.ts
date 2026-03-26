/**
 * News Module — #news
 *
 * Schedule:
 *   Every 5 min (6AM-8PM, weekdays)   — Company news scan
 *   Every 15 min (6AM-8PM, weekdays)  — Macro/general news scan
 */

import { inngest } from "./client";
import { getCompanyNews, getGeneralNews } from "@/lib/finnhub";
import { postEmbed } from "@/lib/discord";
import { buildNewsEmbed } from "@/lib/news-embeds";
import {
  scoreHeadline,
  generateNewsId,
  isFuzzyDuplicate,
  shouldPost,
} from "@/lib/news-scoring";
import { supabase } from "@/lib/supabase";
import {
  isMarketDay,
  isEDT,
  getEasternTime,
  getEasternDateString,
  etIntervalCronPair,
} from "@/lib/market-hours";
import type { ScoredArticle, NewsTag } from "@/types/news";

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

// ── Every 5 min (6AM-8PM) — Company News Scan ──────────────────────

const [companyEDT, companyEST] = etIntervalCronPair(5, 6, 20);

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
      return hour >= 6 && hour <= 20;
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
      return hour >= 6 && hour <= 20;
    });
    if (!shouldRun) return { skipped: true };
    return scanCompanyNews(step);
  }
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function scanCompanyNews(step: any) {
  const posted = await step.run("scan-company-news", async () => {
    const watchlist = await getWatchlistMap();
    const today = getEasternDateString();
    const recentHeadlines = await getRecentHeadlines("news");
    let postedCount = 0;

    // Scan each watchlist ticker
    const tickers = Array.from(watchlist.keys());

    // Process in batches of 5 to respect Finnhub rate limits
    for (let i = 0; i < tickers.length; i += 5) {
      const batch = tickers.slice(i, i + 5);

      const newsResults = await Promise.allSettled(
        batch.map((ticker) => getCompanyNews(ticker, today, today))
      );

      for (let j = 0; j < batch.length; j++) {
        const result = newsResults[j];
        if (result.status === "rejected") continue;

        const ticker = batch[j];
        const articles = result.value;

        for (const article of articles) {
          const newsId = generateNewsId(article.headline, article.source);

          // Dedup: exact hash
          if (await isAlreadyPosted(newsId)) continue;

          // Dedup: fuzzy match against recent posts
          if (recentHeadlines.some((h) => isFuzzyDuplicate(h, article.headline))) continue;

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

          if (shouldReject || !shouldPost(score)) continue;

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
          recentHeadlines.push(article.headline);
          postedCount++;
        }
      }

      // Rate limit pause between batches
      if (i + 5 < tickers.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return postedCount;
  });

  await step.run("log", async () => {
    await logSuccess("company-scan", { posted });
  });

  return { posted };
}

// ── Every 15 min (6AM-8PM) — Macro/General News ────────────────────

const [macroEDT, macroEST] = etIntervalCronPair(15, 6, 20);

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
      return hour >= 6 && hour <= 20;
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
      return hour >= 6 && hour <= 20;
    });
    if (!shouldRun) return { skipped: true };
    return scanMacroNews(step);
  }
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function scanMacroNews(step: any) {
  const posted = await step.run("scan-macro-news", async () => {
    const watchlist = await getWatchlistMap();
    const recentHeadlines = await getRecentHeadlines("news");
    let postedCount = 0;

    const articles = await getGeneralNews();

    for (const article of articles) {
      const newsId = generateNewsId(article.headline, article.source);
      if (await isAlreadyPosted(newsId)) continue;
      if (recentHeadlines.some((h) => isFuzzyDuplicate(h, article.headline))) continue;

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

      if (shouldReject || !shouldPost(score)) continue;

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
      recentHeadlines.push(article.headline);
      postedCount++;
    }

    return postedCount;
  });

  await step.run("log", async () => {
    await logSuccess("macro-scan", { posted });
  });

  return { posted };
}
