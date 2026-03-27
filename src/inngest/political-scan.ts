/**
 * Political News Module — #politics
 *
 * Schedule:
 *   Every 10 min (24/7) — RSS + Finnhub scan
 *   Runs 24/7 because major political events happen outside market hours.
 */

import { inngest } from "./client";
import { getGeneralNews } from "@/lib/finnhub";
import { fetchAllPoliticalFeeds } from "@/lib/rss";
import { postEmbed } from "@/lib/discord";
import { buildPoliticalNewsEmbed } from "@/lib/news-embeds";
import {
  scoreHeadline,
  isMarketRelevant,
  generateNewsId,
  isFuzzyDuplicate,
} from "@/lib/news-scoring";
import {
  buildClusterId,
  isStoryAlreadyPosted,
  markStoryPosted,
} from "@/lib/story-clustering";
import { supabase } from "@/lib/supabase";
import type { RSSItem } from "@/types/news";

// Defaults — overridden by bot_config values from Supabase
const DEFAULT_POLITICS_MAX_PER_CYCLE = 1;
const DEFAULT_POLITICS_SCORE_THRESHOLD = 10;

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

async function getRecentHeadlines(minutes: number = 30): Promise<string[]> {
  const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("posted_news")
    .select("headline")
    .eq("channel", "politics")
    .gte("posted_at", cutoff);
  return (data ?? []).map((r) => r.headline).filter(Boolean) as string[];
}

async function logSuccess(action: string, details: Record<string, unknown>) {
  await supabase.from("bot_log").insert({
    module: "political-news",
    action,
    details,
  });
}

// Sector detection for political news
const SECTOR_KEYWORDS: Record<string, string[]> = {
  Semiconductors: ["semiconductor", "chip", "chips", "wafer", "fab"],
  Technology: ["tech", "software", "ai ", "artificial intelligence", "big tech"],
  Energy: ["oil", "gas", "energy", "solar", "renewable", "opec", "pipeline"],
  Healthcare: ["healthcare", "pharma", "drug", "hospital", "medicare", "medicaid"],
  Finance: ["bank", "banking", "financial", "wall street", "interest rate"],
  Defense: ["defense", "military", "pentagon", "weapon", "missile"],
  Automotive: ["auto", "ev ", "electric vehicle", "car"],
  Agriculture: ["agriculture", "farm", "crop", "grain"],
};

function detectSectors(headline: string): string[] {
  const lower = headline.toLowerCase();
  const sectors: string[] = [];
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      sectors.push(sector);
    }
  }
  return sectors;
}

// ── Every 15 min — Political Scan ───────────────────────────────────

export const politicalScan = inngest.createFunction(
  {
    id: "political-scan",
    retries: 2,
    triggers: [{ cron: "*/15 * * * *" }], // Every 15 min, 24/7 — UTC is fine
  },
  async ({ step }) => {
    const posted = await step.run("scan-political", async () => {
      const watchlist = await getWatchlistMap();
      const recentHeadlines = await getRecentHeadlines();
      let postedCount = 0;

      // Read config from bot_config
      const { data: cfgRows } = await supabase
        .from("bot_config")
        .select("key, value")
        .like("key", "politics.%");
      const cfg: Record<string, string> = {};
      for (const row of cfgRows ?? []) cfg[row.key] = row.value;
      const maxPerCycle = parseInt(cfg["politics.max_per_cycle"] ?? String(DEFAULT_POLITICS_MAX_PER_CYCLE), 10);
      const scoreThreshold = parseInt(cfg["politics.score_threshold"] ?? String(DEFAULT_POLITICS_SCORE_THRESHOLD), 10);

      // Fetch RSS feeds
      const rssItems = await fetchAllPoliticalFeeds(15);

      // Also check Finnhub general news for political content
      let finnhubPolitical: RSSItem[] = [];
      try {
        const generalNews = await getGeneralNews();
        finnhubPolitical = generalNews
          .filter((n) => isMarketRelevant(n.headline))
          .map((n) => ({
            title: n.headline,
            link: n.url,
            description: n.summary,
            pubDate: new Date(n.datetime * 1000).toISOString(),
            source: n.source,
          }));
      } catch {
        // Finnhub failure is non-critical for political scan
      }

      const allItems = [...rssItems, ...finnhubPolitical];

      for (const item of allItems) {
        // Per-cycle cap
        if (postedCount >= maxPerCycle) break;

        // Must be market-relevant
        if (!isMarketRelevant(item.title)) continue;

        const newsId = generateNewsId(item.title, item.source);
        if (await isAlreadyPosted(newsId)) continue;
        if (recentHeadlines.some((h) => isFuzzyDuplicate(h, item.title))) continue;

        // Story-level dedup: same event already posted in last 4 hours?
        const clusterId = buildClusterId(item.title);
        if (await isStoryAlreadyPosted(clusterId, "politics")) continue;

        // Score using the same engine
        const { score, shouldReject } = scoreHeadline(
          item.title,
          item.source,
          watchlist,
          []
        );

        if (shouldReject || score < scoreThreshold) continue;

        const sectors = detectSectors(item.title);

        const embed = buildPoliticalNewsEmbed(
          item.title,
          item.description,
          item.source,
          item.link,
          undefined,
          sectors.length > 0 ? sectors : undefined
        );

        await postEmbed("politics", embed);

        await supabase.from("posted_news").insert({
          news_id: newsId,
          ticker: null,
          category: "political",
          channel: "politics",
          headline: item.title,
        });

        await markStoryPosted(clusterId, "politics", item.title);
        recentHeadlines.push(item.title);
        postedCount++;
      }

      return postedCount;
    });

    await step.run("log", async () => {
      await logSuccess("political-scan", { posted });
    });

    return { posted };
  }
);
