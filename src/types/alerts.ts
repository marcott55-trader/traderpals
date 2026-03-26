// ── Price Alert Types ───────────────────────────────────────────────

export type AlertType = "above" | "below" | "ma_cross" | "vwap" | "pct_move";

export interface PriceAlertRow {
  id: number;
  ticker: string;
  alert_type: AlertType;
  level: number | null;
  ma_period: number | null;
  discord_user_id: string;
  discord_username: string | null;
  active: boolean;
  triggered_at: string | null;
  created_at: string;
}

export interface AlertCheckResult {
  alert: PriceAlertRow;
  triggered: boolean;
  currentPrice: number;
  sessionChange: number;
  volume: number;
}

// Guard rails
export const MAX_ALERTS_PER_USER = 20;
export const ALERT_COOLDOWN_MINUTES = 15;
export const VALID_MA_PERIODS = [9, 20, 50, 100, 200] as const;

// ── Econ Event Types ────────────────────────────────────────────────

export interface EconEventRow {
  id: number;
  event_date: string;
  event_time: string | null;
  event_name: string;
  country: string;
  impact: string | null;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  is_fed_speech: boolean;
  speaker_name: string | null;
  is_voting_member: boolean | null;
  alert_sent: boolean;
  result_posted: boolean;
  created_at: string;
}

// ── Earnings Types ──────────────────────────────────────────────────

export interface EarningsResult {
  ticker: string;
  epsActual: number | null;
  epsEstimate: number | null;
  revenueActual: number | null;
  revenueEstimate: number | null;
  hour: string; // bmo, amc, dmh
  reportDate: string;
  isBeat: boolean | null;
  isWatchlist: boolean;
}

export interface PostedEarningsRow {
  ticker: string;
  report_date: string;
  result_posted: boolean;
  posted_at: string;
}

// ── Flow / Sentiment Types ──────────────────────────────────────────

export interface UnusualOptions {
  ticker: string;
  callVolume: number;
  putVolume: number;
  totalVolume: number;
  openInterest: number;
  volumeToOI: number;
  signal: "bullish" | "bearish" | "neutral";
}

export interface RedditMention {
  ticker: string;
  mentions24h: number;
  avgMentions7d: number;
  spikeMultiple: number;
  sentimentBullish: number; // 0-100
}

export interface ShortInterestData {
  ticker: string;
  shortInterest: number;
  shortPercentFloat: number;
  daysToCover: number;
}
