const BASE_URL = "https://finnhub.io/api/v1";

function getApiKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("Missing FINNHUB_API_KEY");
  return key;
}

async function finnhubFetch<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}${path.includes("?") ? "&" : "?"}token=${getApiKey()}`;
  const res = await fetch(url);

  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2_000));
    const retry = await fetch(url);
    if (!retry.ok) {
      throw new Error(`Finnhub API error after retry: ${retry.status}`);
    }
    return retry.json() as Promise<T>;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Finnhub API error: ${res.status} — ${body}`);
  }

  return res.json() as Promise<T>;
}

// ── Quotes ──────────────────────────────────────────────────────────

interface FinnhubQuote {
  c: number; // current price
  d: number; // change
  dp: number; // percent change
  h: number; // high of day
  l: number; // low of day
  o: number; // open
  pc: number; // previous close
  t: number; // timestamp
}

export async function getQuote(symbol: string): Promise<FinnhubQuote> {
  return finnhubFetch<FinnhubQuote>(`/quote?symbol=${encodeURIComponent(symbol)}`);
}

interface CompanyProfile {
  ticker?: string;
  name?: string;
  exchange?: string;
}

export async function hasCompanyProfile(symbol: string): Promise<boolean> {
  const profile = await finnhubFetch<CompanyProfile>(
    `/stock/profile2?symbol=${encodeURIComponent(symbol)}`
  );

  return Boolean(profile.ticker || profile.name || profile.exchange);
}

// ── Futures (via Yahoo Finance fallback) ────────────────────────────
// Finnhub free tier doesn't reliably support futures symbols.
// Use Yahoo Finance's chart endpoint as a free, no-auth-needed source.

interface YahooChartResult {
  chart: {
    result: Array<{
      meta: {
        regularMarketPrice: number;
        previousClose: number;
      };
    }>;
  };
}

async function getYahooQuote(
  symbol: string
): Promise<{ price: number; changePercent: number }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "traderpals-bot/1.0" },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance error for ${symbol}: ${res.status}`);
  }

  const data = (await res.json()) as YahooChartResult;
  const meta = data.chart.result?.[0]?.meta;
  if (!meta) throw new Error(`No data from Yahoo for ${symbol}`);

  const price = meta.regularMarketPrice;
  const prevClose = meta.previousClose;
  const changePercent = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

  return { price, changePercent };
}

export interface FuturesData {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
}

const FUTURES_MAP: Record<string, string> = {
  "ES=F": "ES (S&P 500)",
  "NQ=F": "NQ (Nasdaq)",
  "YM=F": "YM (Dow)",
};

/** Fetch major futures quotes via Yahoo Finance */
export async function getFuturesQuotes(): Promise<FuturesData[]> {
  const results: FuturesData[] = [];

  for (const [symbol, name] of Object.entries(FUTURES_MAP)) {
    try {
      const quote = await getYahooQuote(symbol);
      results.push({
        symbol,
        name,
        price: quote.price,
        changePercent: quote.changePercent,
      });
    } catch (err) {
      console.error(`Failed to fetch futures quote for ${symbol}:`, err);
      // Skip this future rather than failing the whole function
    }
  }

  return results;
}

// ── Earnings Calendar ───────────────────────────────────────────────

export interface EarningsEvent {
  date: string;
  epsActual: number | null;
  epsEstimate: number | null;
  hour: string; // bmo, amc, dmh
  quarter: number;
  revenueActual: number | null;
  revenueEstimate: number | null;
  symbol: string;
  year: number;
}

interface EarningsCalendarResponse {
  earningsCalendar: EarningsEvent[];
}

export async function getEarningsCalendar(
  from: string,
  to: string
): Promise<EarningsEvent[]> {
  const data = await finnhubFetch<EarningsCalendarResponse>(
    `/calendar/earnings?from=${from}&to=${to}`
  );
  return data.earningsCalendar ?? [];
}

// ── Economic Calendar ───────────────────────────────────────────────

export interface EconEvent {
  actual: string | null;
  country: string;
  estimate: string | null;
  event: string;
  impact: string; // high, medium, low
  prev: string | null;
  time: string;
  unit: string;
}

interface EconCalendarResponse {
  economicCalendar: EconEvent[];
}

export async function getEconomicCalendar(
  from: string,
  to: string
): Promise<EconEvent[]> {
  const data = await finnhubFetch<EconCalendarResponse>(
    `/calendar/economic?from=${from}&to=${to}`
  );
  return data.economicCalendar ?? [];
}

// ── Company News ────────────────────────────────────────────────────

export interface CompanyNews {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

export async function getCompanyNews(
  symbol: string,
  from: string,
  to: string
): Promise<CompanyNews[]> {
  return finnhubFetch<CompanyNews[]>(
    `/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`
  );
}

// ── General News ────────────────────────────────────────────────────

export async function getGeneralNews(): Promise<CompanyNews[]> {
  return finnhubFetch<CompanyNews[]>("/news?category=general");
}
