const TICKER_PATTERN = /^[A-Z]{1,5}(?:\.[A-Z])?$/;

export const WATCHLIST_TIERS = ["tier1", "tier2", "futures", "custom"] as const;

export type WatchlistTier = (typeof WATCHLIST_TIERS)[number];

export function normalizeTicker(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidTickerFormat(ticker: string): boolean {
  return TICKER_PATTERN.test(ticker);
}

export function isValidWatchlistTier(value: string): value is WatchlistTier {
  return (WATCHLIST_TIERS as readonly string[]).includes(value);
}
