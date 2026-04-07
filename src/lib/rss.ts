/**
 * Minimal RSS feed parser for political news sources.
 * Parses RSS 2.0 / Atom feeds without external dependencies.
 */

import type { RSSItem } from "@/types/news";

interface FeedConfig {
  url: string;
  source: string;
}

export const POLITICAL_FEEDS: FeedConfig[] = [
  { url: "https://www.whitehouse.gov/news/feed/", source: "White House" },
  { url: "https://rss.politico.com/politics-news.xml", source: "Politico" },
  { url: "https://thehill.com/feed/", source: "The Hill" },
];

/**
 * Parse an RSS 2.0 XML string into items.
 * Uses regex-based extraction (no DOM parser needed in serverless).
 */
function parseRSSXml(xml: string, source: string): RSSItem[] {
  const items: RSSItem[] = [];

  // Match <item>...</item> blocks
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const description = extractTag(block, "description");
    const pubDate = extractTag(block, "pubDate");

    if (!title) continue;

    items.push({
      title: decodeHtmlEntities(title),
      link: link ?? "",
      description: decodeHtmlEntities(description ?? ""),
      pubDate: pubDate ?? "",
      source,
    });
  }

  return items;
}

function extractTag(block: string, tag: string): string | null {
  // Handle CDATA: <title><![CDATA[...]]></title>
  const cdataRegex = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    "i"
  );
  const cdataMatch = cdataRegex.exec(block);
  if (cdataMatch) return cdataMatch[1].trim();

  // Handle plain text: <title>...</title>
  const plainRegex = new RegExp(
    `<${tag}[^>]*>([\\s\\S]*?)</${tag}>`,
    "i"
  );
  const plainMatch = plainRegex.exec(block);
  if (plainMatch) return plainMatch[1].trim();

  return null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Fetch and parse a single RSS feed.
 * Returns empty array on failure (never throws).
 */
async function fetchFeed(feed: FeedConfig): Promise<RSSItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TraderpalsBot/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`RSS fetch failed for ${feed.source}: ${res.status}`);
      return [];
    }

    const xml = await res.text();
    return parseRSSXml(xml, feed.source);
  } catch (err) {
    console.error(`RSS fetch error for ${feed.source}:`, err);
    return [];
  }
}

/**
 * Fetch all political RSS feeds and return combined items.
 * Items from the last `maxAgeMinutes` are included (default: 15 min).
 */
export async function fetchAllPoliticalFeeds(
  maxAgeMinutes: number = 15
): Promise<RSSItem[]> {
  const results = await Promise.allSettled(
    POLITICAL_FEEDS.map((feed) => fetchFeed(feed))
  );

  const cutoff = Date.now() - maxAgeMinutes * 60 * 1000;
  const items: RSSItem[] = [];

  for (const result of results) {
    if (result.status === "rejected") continue;
    for (const item of result.value) {
      // Filter by age if pubDate is available
      if (item.pubDate) {
        const pubTime = new Date(item.pubDate).getTime();
        if (pubTime && pubTime < cutoff) continue;
      }
      items.push(item);
    }
  }

  return items;
}
