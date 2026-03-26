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

// Politics-specific: max 2 posts per 10-min scan cycle
const POLITICS_MAX_PER_CYCLE = 2;
// Politics requires higher score — must have source quality or keyword match
const POLITICS_SCORE_THRESHOLD = 30;

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

// ── Every 10 min — Political Scan ───────────────────────────────────

export const politicalScan = inngest.createFunction(
  {
    id: "political-scan",
    retries: 2,
    triggers: [{ cron: "*/10 * * * *" }], // Every 10 min, 24/7 — UTC is fine
  },
  async ({ step }) => {
    const posted = await step.run("scan-political", async () => {
      const watchlist = await getWatchlistMap();
      const recentHeadlines = await getRecentHeadlines();
      let postedCount = 0;

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
        if (postedCount >= POLITICS_MAX_PER_CYCLE) break;

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

        if (shouldReject || score < POLITICS_SCORE_THRESHOLD) continue;

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
