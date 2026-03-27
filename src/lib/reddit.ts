/**
 * Reddit API Client
 *
 * Scans r/wallstreetbets and r/stocks for ticker mentions.
 * Uses OAuth2 "script" app type (server-to-server, no user login).
 *
 * Requires: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET env vars.
 */

import type { RedditMention } from "@/types/alerts";
import { supabase } from "./supabase";

const REDDIT_AUTH_URL = "https://www.reddit.com/api/v1/access_token";
const REDDIT_API = "https://oauth.reddit.com";
const USER_AGENT = "traderpals-bot/1.0";

// Subreddits to scan
const SUBREDDITS = ["wallstreetbets", "stocks", "options"];

// Common words that match ticker symbols — filter these out
const FALSE_POSITIVE_TICKERS = new Set([
  "A", "AI", "ALL", "AM", "AN", "ARE", "AT", "BE", "BIG", "CAN",
  "CEO", "DD", "DO", "EV", "FOR", "GO", "HAS", "HE", "HER", "HIM",
  "HIS", "HOW", "I", "IF", "IN", "IS", "IT", "ITS", "KEY", "MAN",
  "ME", "MY", "NEW", "NO", "NOT", "NOW", "OF", "OLD", "ON", "ONE",
  "OR", "OUT", "OUR", "PM", "RUN", "SAY", "SEE", "SHE", "SO",
  "THE", "TOO", "TWO", "UP", "US", "WAS", "WAR", "WAY", "WE",
  "WHO", "WHY", "WIN", "YOU",
]);

// ── Auth ────────────────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(REDDIT_AUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`Reddit auth failed: ${res.status}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // Refresh 60s early
  };

  return cachedToken.token;
}

// ── Fetching ────────────────────────────────────────────────────────

interface RedditPost {
  title: string;
  selftext: string;
  score: number;
  num_comments: number;
  created_utc: number;
}

async function fetchHotPosts(
  subreddit: string,
  limit: number = 50
): Promise<RedditPost[]> {
  const token = await getAccessToken();

  const res = await fetch(
    `${REDDIT_API}/r/${subreddit}/hot?limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": USER_AGENT,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Reddit fetch r/${subreddit} failed: ${res.status}`);
  }

  const data = await res.json();
  return (data.data?.children ?? []).map(
    (child: { data: RedditPost }) => child.data
  );
}

// ── Ticker extraction ───────────────────────────────────────────────

function extractTickers(text: string, watchlist: Set<string>): string[] {
  const found = new Set<string>();

  // Match $TICKER pattern (explicit mention)
  const cashtagMatches = text.match(/\$([A-Z]{1,5})/g);
  if (cashtagMatches) {
    for (const match of cashtagMatches) {
      const ticker = match.slice(1); // Remove $
      if (!FALSE_POSITIVE_TICKERS.has(ticker)) {
        found.add(ticker);
      }
    }
  }

  // Match bare TICKER if it's in our watchlist (reduces false positives)
  const words = text.toUpperCase().split(/\s+/);
  for (const word of words) {
    const clean = word.replace(/[^A-Z]/g, "");
    if (clean.length >= 2 && clean.length <= 5 && watchlist.has(clean)) {
      found.add(clean);
    }
  }

  return Array.from(found);
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Scan Reddit for ticker mentions across tracked subreddits.
 * Returns tickers with mention counts and spike detection.
 */
export async function scanRedditMentions(
  watchlistTickers: string[]
): Promise<RedditMention[]> {
  const watchlistSet = new Set(watchlistTickers);
  const mentionCounts = new Map<string, number>();

  // Fetch hot posts from all subreddits
  for (const sub of SUBREDDITS) {
    try {
      const posts = await fetchHotPosts(sub, 50);

      for (const post of posts) {
        // Only consider posts from last 24 hours
        const ageHours = (Date.now() / 1000 - post.created_utc) / 3600;
        if (ageHours > 24) continue;

        const text = `${post.title} ${post.selftext}`;
        const tickers = extractTickers(text, watchlistSet);

        // Weight by engagement
        const weight = post.score > 100 ? 2 : 1;

        for (const ticker of tickers) {
          mentionCounts.set(
            ticker,
            (mentionCounts.get(ticker) ?? 0) + weight
          );
        }
      }

      // Small delay between subreddits
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      // Skip failed subreddit, continue with others
    }
  }

  // Load 7-day rolling averages from bot_log
  const results: RedditMention[] = [];

  for (const [ticker, mentions24h] of mentionCounts) {
    // Get 7-day average from historical logs
    const avg7d = await get7DayAverage(ticker);
    const spikeMultiple = avg7d > 0 ? mentions24h / avg7d : mentions24h;

    results.push({
      ticker,
      mentions24h,
      avgMentions7d: avg7d,
      spikeMultiple,
      sentimentBullish: 50, // V1: neutral default. V2: sentiment analysis
    });
  }

  // Sort by spike multiple descending
  return results.sort((a, b) => b.spikeMultiple - a.spikeMultiple);
}

/**
 * Get the 7-day average mention count for a ticker from bot_log.
 */
async function get7DayAverage(ticker: string): Promise<number> {
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data } = await supabase
    .from("bot_log")
    .select("details")
    .eq("module", "flow")
    .eq("action", "reddit-mentions")
    .gte("created_at", sevenDaysAgo);

  if (!data || data.length === 0) return 0;

  let total = 0;
  let count = 0;
  for (const row of data) {
    const mentions = (row.details as Record<string, number>)?.[ticker];
    if (mentions !== undefined) {
      total += mentions;
      count++;
    }
  }

  return count > 0 ? total / count : 0;
}

/**
 * Save today's mention counts to bot_log for future 7-day average calculation.
 */
export async function saveRedditMentionLog(
  mentions: Map<string, number>
): Promise<void> {
  const details: Record<string, number> = {};
  for (const [ticker, count] of mentions) {
    details[ticker] = count;
  }

  await supabase.from("bot_log").insert({
    module: "flow",
    action: "reddit-mentions",
    details,
  });
}
