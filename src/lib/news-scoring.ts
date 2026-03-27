/**
 * News headline scoring engine.
 * Scores 0-100 based on watchlist relevance, keywords, and source quality.
 */

import type { NewsTag } from "@/types/news";
import {
  NEWS_SCORE_THRESHOLD,
  REJECT_PATTERNS,
  MARKET_RELEVANT_KEYWORDS,
  NOISE_KEYWORDS,
} from "@/types/news";

// ── Source scores ───────────────────────────────────────────────────

const TIER_1_SOURCES = new Set([
  "reuters", "bloomberg", "wsj", "wall street journal", "cnbc", "associated press", "ap news",
]);

const TIER_2_SOURCES = new Set([
  "marketwatch", "barrons", "barron's", "financial times", "ft", "benzinga", "investing.com", "yahoo", "yahoo finance",
]);

// ── Keyword → tag mapping ───────────────────────────────────────────

const TAG_KEYWORDS: Record<NewsTag, string[]> = {
  earnings: ["earnings", "revenue", "eps", "quarterly results", "guidance", "profit", "beat", "miss"],
  fed: ["fomc", "federal reserve", "fed chair", "interest rate", "rate cut", "rate hike", "powell"],
  upgrade: ["upgrade", "downgrade", "price target", "analyst", "rating"],
  ma: ["acquisition", "acquire", "merger", "buyout", "takeover", "deal"],
  legal: ["sec", "lawsuit", "settlement", "investigation", "indictment", "subpoena", "fine"],
  fda: ["fda", "drug approval", "clinical trial", "phase 3", "nda", "ema"],
  management: ["ceo", "cfo", "resign", "appoint", "hire", "fire", "board of directors"],
  dividend: ["dividend", "buyback", "share repurchase", "special dividend"],
  warning: ["warning", "recall", "downside", "risk", "bankruptcy", "default"],
  tariff: ["tariff", "trade war", "trade deal", "sanctions", "embargo"],
  regulation: ["regulation", "antitrust", "ban", "restrict", "comply"],
  geopolitical: ["china", "taiwan", "russia", "ukraine", "opec", "middle east"],
  general: [],
};

// High-value keywords that add +25 to score
const HIGH_VALUE_KEYWORDS = new Set([
  "earnings", "fda", "acquisition", "fomc", "merger",
  "buyout", "approval", "indictment", "bankruptcy",
  "guidance", "downgrade", "upgrade", "price target",
  "sec", "lawsuit", "tariff", "sanctions", "partnership", "contract",
]);

// ── Scoring ─────────────────────────────────────────────────────────

export interface ScoreResult {
  score: number;
  tag: NewsTag;
  isBreaking: boolean;
  shouldReject: boolean;
}

export function scoreHeadline(
  headline: string,
  source: string,
  tickerTiers: Map<string, string>, // ticker -> tier
  relatedTickers: string[]
): ScoreResult {
  const lower = headline.toLowerCase();
  const sourceLower = source.toLowerCase();
  let score = 0;

  // Check rejection patterns
  for (const pattern of REJECT_PATTERNS) {
    if (lower.includes(pattern)) {
      return { score: 0, tag: "general", isBreaking: false, shouldReject: true };
    }
  }

  // Watchlist scoring
  for (const ticker of relatedTickers) {
    const tier = tickerTiers.get(ticker);
    if (tier === "tier1") {
      score += 30;
      break; // Only count best tier once
    } else if (tier === "tier2") {
      score += 15;
      break;
    }
  }

  // High-value keyword scoring (+25)
  for (const kw of HIGH_VALUE_KEYWORDS) {
    if (lower.includes(kw)) {
      score += 25;
      break; // Only one keyword bonus
    }
  }

  // Source scoring
  if (TIER_1_SOURCES.has(sourceLower)) {
    score += 20;
  } else if (TIER_2_SOURCES.has(sourceLower)) {
    score += 10;
  }

  // Determine tag
  const tag = detectTag(lower);

  return {
    score,
    tag,
    isBreaking: score >= 70,
    shouldReject: false,
  };
}

function detectTag(headline: string): NewsTag {
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS) as [NewsTag, string[]][]) {
    if (tag === "general") continue;
    for (const kw of keywords) {
      if (headline.includes(kw)) return tag;
    }
  }
  return "general";
}

/**
 * Check if a political headline is market-relevant.
 */
export function isMarketRelevant(headline: string): boolean {
  const lower = headline.toLowerCase();

  // Reject noise first
  for (const noise of NOISE_KEYWORDS) {
    if (lower.includes(noise)) return false;
  }

  // Exception: election results are market-moving
  if (lower.includes("election") && lower.includes("result")) return true;

  // Must match at least one market-relevant keyword
  for (const kw of MARKET_RELEVANT_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }

  return false;
}

/**
 * Generate a dedup hash for a news headline.
 * Uses simple string hashing (not crypto) for speed.
 */
export function generateNewsId(headline: string, source: string): string {
  const input = `${headline.toLowerCase().trim()}|${source.toLowerCase().trim()}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return `news_${Math.abs(hash).toString(36)}`;
}

/**
 * Simple fuzzy match: check if two headlines are >85% similar.
 * Uses character-level similarity (Sørensen-Dice on bigrams).
 */
export function isFuzzyDuplicate(a: string, b: string, threshold: number = 0.85): boolean {
  const bigramsA = getBigrams(a.toLowerCase());
  const bigramsB = getBigrams(b.toLowerCase());

  let intersection = 0;
  const countB = new Map<string, number>();
  for (const bg of bigramsB) {
    countB.set(bg, (countB.get(bg) ?? 0) + 1);
  }

  for (const bg of bigramsA) {
    const count = countB.get(bg);
    if (count && count > 0) {
      intersection++;
      countB.set(bg, count - 1);
    }
  }

  const similarity = (2 * intersection) / (bigramsA.length + bigramsB.length);
  return similarity >= threshold;
}

function getBigrams(str: string): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.push(str.substring(i, i + 2));
  }
  return bigrams;
}

/**
 * Check if score meets the posting threshold.
 */
export function shouldPost(score: number): boolean {
  return score >= NEWS_SCORE_THRESHOLD;
}
