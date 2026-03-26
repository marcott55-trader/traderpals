/**
 * Story Clustering — event-level deduplication
 *
 * Instead of comparing article-to-article, we cluster articles into "stories"
 * based on key entities, event type, and time bucket. Only one post per
 * story cluster is allowed within a 4-hour window.
 *
 * Example cluster key: "trump|tariff|policy|2026-03-26T12"
 * This catches:
 *   "Trump says X on tariffs"
 *   "Markets react to Trump tariff remarks"
 *   "White House clarifies tariff plan"
 * ...as the SAME story.
 */

import { supabase } from "./supabase";

// ── Entity extraction (lightweight, no NLP needed) ──────────────────

const ENTITY_PATTERNS: Record<string, string[]> = {
  // People
  trump: ["trump"],
  biden: ["biden"],
  powell: ["powell", "fed chair"],
  yellen: ["yellen"],
  // Companies (top watchlist)
  nvda: ["nvidia", "nvda", "jensen huang"],
  tsla: ["tesla", "tsla", "elon musk"],
  aapl: ["apple", "aapl", "tim cook"],
  msft: ["microsoft", "msft", "satya nadella"],
  meta: ["meta", "facebook", "zuckerberg"],
  amzn: ["amazon", "amzn", "andy jassy"],
  googl: ["google", "alphabet", "googl", "sundar pichai"],
  amd: ["amd", "lisa su"],
  // Institutions
  fed: ["federal reserve", "fomc", "the fed"],
  sec: ["sec ", "securities and exchange"],
  congress: ["congress", "senate", "house of representatives", "capitol hill"],
  whitehouse: ["white house", "oval office", "executive order"],
  china: ["china", "beijing", "xi jinping"],
  russia: ["russia", "putin", "kremlin"],
};

const EVENT_TYPES: Record<string, string[]> = {
  tariff: ["tariff", "duty", "import tax", "trade war", "trade deal"],
  rates: ["interest rate", "rate cut", "rate hike", "rate decision", "basis points"],
  earnings: ["earnings", "revenue", "eps", "quarterly results", "profit", "guidance"],
  regulation: ["regulation", "antitrust", "ban", "restrict", "investigate"],
  sanctions: ["sanction", "embargo", "blacklist"],
  shutdown: ["shutdown", "debt ceiling", "spending bill"],
  merger: ["merger", "acquisition", "acquire", "buyout", "takeover"],
  layoffs: ["layoff", "restructuring", "job cuts", "workforce reduction"],
  fda: ["fda", "drug approval", "clinical trial"],
  inflation: ["cpi", "inflation", "consumer price", "ppi", "pce"],
  jobs: ["jobs report", "nonfarm", "unemployment", "jobless claims", "labor market"],
  military: ["military", "missile", "strike", "invasion", "troops"],
};

function extractEntities(headline: string): string[] {
  const lower = headline.toLowerCase();
  const found: string[] = [];
  for (const [entity, patterns] of Object.entries(ENTITY_PATTERNS)) {
    if (patterns.some((p) => lower.includes(p))) {
      found.push(entity);
    }
  }
  return found.sort();
}

function extractEventType(headline: string): string {
  const lower = headline.toLowerCase();
  for (const [eventType, patterns] of Object.entries(EVENT_TYPES)) {
    if (patterns.some((p) => lower.includes(p))) {
      return eventType;
    }
  }
  return "general";
}

/**
 * Generate a time bucket string (4-hour windows).
 * E.g., "2026-03-26T08" for anything between 8:00-11:59
 */
function getTimeBucket(): string {
  const now = new Date();
  const bucket = Math.floor(now.getUTCHours() / 4) * 4;
  const date = now.toISOString().split("T")[0];
  return `${date}T${String(bucket).padStart(2, "0")}`;
}

/**
 * Build a story cluster ID from a headline.
 * Format: "entity1,entity2|event_type|time_bucket"
 */
export function buildClusterId(headline: string): string {
  const entities = extractEntities(headline);
  const eventType = extractEventType(headline);
  const timeBucket = getTimeBucket();

  // If no entities found, use a hash of key words to avoid over-clustering
  const entityPart = entities.length > 0
    ? entities.slice(0, 3).join(",")
    : extractKeyTerms(headline);

  return `${entityPart}|${eventType}|${timeBucket}`;
}

/**
 * Fallback: extract 2-3 key terms from headline for clustering
 * when no known entities are found.
 */
function extractKeyTerms(headline: string): string {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "has", "have", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "can", "shall", "to", "of",
    "in", "for", "on", "with", "at", "by", "from", "as", "into",
    "about", "after", "before", "during", "and", "but", "or", "not",
    "that", "this", "it", "its", "new", "says", "said", "report",
    "reports", "according", "source", "sources", "market", "markets",
    "stock", "stocks", "share", "shares", "trading", "trader",
  ]);

  const words = headline
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  return words.slice(0, 3).join(",") || "unknown";
}

/**
 * Check if a story cluster has already been posted within the current
 * 4-hour window. Uses the posted_news table with a cluster_id convention.
 */
export async function isStoryAlreadyPosted(
  clusterId: string,
  channel: string
): Promise<boolean> {
  // Check for any post with same cluster in the last 4 hours
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const clusterNewsId = `cluster_${clusterId}`;

  const { data } = await supabase
    .from("posted_news")
    .select("news_id")
    .eq("channel", channel)
    .eq("category", "cluster")
    .eq("news_id", clusterNewsId)
    .gte("posted_at", fourHoursAgo)
    .limit(1);

  return (data ?? []).length > 0;
}

/**
 * Mark a story cluster as posted.
 */
export async function markStoryPosted(
  clusterId: string,
  channel: string,
  headline: string
): Promise<void> {
  const clusterNewsId = `cluster_${clusterId}`;

  await supabase.from("posted_news").upsert({
    news_id: clusterNewsId,
    ticker: null,
    category: "cluster",
    channel,
    headline,
  });
}
