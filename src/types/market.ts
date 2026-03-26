// Polygon API types

export interface PolygonSnapshotTicker {
  ticker: string;
  todaysChangePerc: number;
  todaysChange: number;
  updated: number;
  day: {
    o: number; // open
    h: number; // high
    l: number; // low
    c: number; // close
    v: number; // volume
    vw: number; // volume-weighted average price
  };
  lastTrade: {
    p: number; // price
    s: number; // size
    t: number; // timestamp
  };
  prevDay: {
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
    vw: number;
  };
}

export interface PolygonSnapshotResponse {
  status: string;
  tickers: PolygonSnapshotTicker[];
}

// Processed types used by our modules

export interface MarketMover {
  ticker: string;
  price: number;
  changePercent: number;
  volume: number;
  isWatchlist: boolean;
  tier: string | null;
}

export interface FuturesQuote {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
}

// Discord embed types

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  color: number;
  description?: string;
  fields: DiscordEmbedField[];
  footer?: { text: string };
  url?: string;
  timestamp?: string;
}

// Supabase row types

export interface WatchlistRow {
  ticker: string;
  tier: string;
  added_by: string | null;
  added_at: string;
}

export interface BotLogRow {
  module: string;
  action: string;
  details: Record<string, unknown> | null;
}
