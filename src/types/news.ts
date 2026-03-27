// ── News & Political News Types ─────────────────────────────────────

export interface ScoredArticle {
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;
  tickers: string[];
  score: number;
  category: NewsCategory;
  tag: NewsTag;
  newsId: string; // hash for dedup
}

export type NewsCategory = "company" | "macro" | "political";

export type NewsTag =
  | "earnings"
  | "fed"
  | "upgrade"
  | "ma"
  | "legal"
  | "fda"
  | "management"
  | "dividend"
  | "warning"
  | "tariff"
  | "regulation"
  | "geopolitical"
  | "general";

export interface PostedNewsRow {
  news_id: string;
  ticker: string | null;
  category: string;
  channel: string;
  headline: string | null;
  posted_at: string;
}

export interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
}

// Political news filtering
export const MARKET_RELEVANT_KEYWORDS = [
  "tariff", "trade war", "trade deal", "sanctions", "embargo",
  "government shutdown", "debt ceiling", "spending bill", "stimulus",
  "executive order", "signed into law",
  "antitrust", "sec", "ftc", "doj", "regulation", "ban",
  "china", "taiwan", "russia", "ukraine", "opec", "middle east",
  "iran", "north korea", "nato",
  "oil", "crude", "energy",
  "war", "military", "troops", "missile", "strike", "invasion",
  "tax cut", "tax hike", "corporate tax", "capital gains tax",
  "defense spending", "healthcare bill", "drug pricing",
  "tech regulation", "ai regulation", "crypto regulation",
  "interest rate", "fed ", "federal reserve", "inflation",
] as const;

export const NOISE_KEYWORDS = [
  "campaign rally", "poll numbers", "approval rating",
  "primary election", "debate schedule", "fundraising", "endorsement",
] as const;

// Score thresholds
export const NEWS_SCORE_THRESHOLD = 30;
export const NEWS_BREAKING_THRESHOLD = 70;

// Max articles posted per scan cycle (prevents spam)
export const NEWS_MAX_PER_CYCLE = 3;

// Headline rejection patterns
export const REJECT_PATTERNS = [
  "sponsored", "advertisement", "penny stock", "crypto airdrop",
] as const;
