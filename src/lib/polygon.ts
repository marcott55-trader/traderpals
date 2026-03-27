import type {
  PolygonAggBar,
  PolygonAggsResponse,
  PolygonSnapshotResponse,
  PolygonSnapshotTicker,
} from "@/types/market";

const BASE_URL = "https://api.polygon.io";

function getApiKey(): string {
  const key = process.env.POLYGON_API_KEY;
  if (!key) throw new Error("Missing POLYGON_API_KEY");
  return key;
}

async function polygonFetch<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}${path.includes("?") ? "&" : "?"}apiKey=${getApiKey()}`;
  const res = await fetch(url);

  if (res.status === 429) {
    // Polygon free tier: 5 calls/min. Wait and retry once.
    await new Promise((r) => setTimeout(r, 12_000));
    const retry = await fetch(url);
    if (!retry.ok) {
      throw new Error(`Polygon API error after retry: ${retry.status}`);
    }
    return retry.json() as Promise<T>;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Polygon API error: ${res.status} — ${body}`);
  }

  return res.json() as Promise<T>;
}

/** Top gainers snapshot */
export async function getTopGainers(): Promise<PolygonSnapshotTicker[]> {
  const data = await polygonFetch<PolygonSnapshotResponse>(
    "/v2/snapshot/locale/us/markets/stocks/gainers"
  );
  return data.tickers ?? [];
}

/** Top losers snapshot */
export async function getTopLosers(): Promise<PolygonSnapshotTicker[]> {
  const data = await polygonFetch<PolygonSnapshotResponse>(
    "/v2/snapshot/locale/us/markets/stocks/losers"
  );
  return data.tickers ?? [];
}

/** Snapshot for specific tickers (comma-separated list) */
export async function getTickerSnapshots(
  tickers: string[]
): Promise<PolygonSnapshotTicker[]> {
  const tickerList = tickers.join(",");
  const data = await polygonFetch<PolygonSnapshotResponse>(
    `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickerList}`
  );
  return data.tickers ?? [];
}

function formatDateForPolygon(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function getMinuteBars(
  ticker: string,
  from: string,
  to: string
): Promise<PolygonAggBar[]> {
  const data = await polygonFetch<PolygonAggsResponse>(
    `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/minute/${from}/${to}?adjusted=true&sort=asc&limit=50000`
  );
  return data.results ?? [];
}

export async function getRecentMinuteBars(
  ticker: string,
  lookbackDays: number = 2
): Promise<PolygonAggBar[]> {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - lookbackDays);
  return getMinuteBars(ticker, formatDateForPolygon(from), formatDateForPolygon(to));
}

// ── Low Float Scanner (uses FMP for real free float data) ───────────

export interface LowFloatMover {
  ticker: string;
  price: number;
  changePercent: number;
  volume: number;
  float: number; // actual free float shares from FMP
}

interface FMPFloatResponse {
  symbol: string;
  freeFloat: number; // percentage
  floatShares: number; // actual free float share count
  outstandingShares: number;
}

/** Fetch free float for a single ticker from Financial Modeling Prep */
async function getFreeFloat(ticker: string): Promise<number | null> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/shares-float?symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`
    );
    if (!res.ok) return null;

    const data = (await res.json()) as FMPFloatResponse[];
    return data?.[0]?.floatShares ?? null;
  } catch {
    return null;
  }
}

/** Batch fetch free float for multiple tickers from FMP */
async function batchGetFreeFloat(
  tickers: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  // FMP free tier: 250 calls/day. Fetch in batches of 5.
  for (let i = 0; i < tickers.length; i += 5) {
    const batch = tickers.slice(i, i + 5);
    const promises = batch.map(async (ticker) => {
      const floatShares = await getFreeFloat(ticker);
      if (floatShares !== null) result.set(ticker, floatShares);
    });
    await Promise.allSettled(promises);

    if (i + 5 < tickers.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return result;
}

/**
 * Scan Polygon gainers/losers for low free-float stocks.
 * Uses FMP API for real free float data (not shares outstanding).
 * Filters: free float 100K-20M, volume >= 100K, any price.
 */
export async function getLowFloatMovers(
  minFloat: number = 100_000,
  maxFloat: number = 20_000_000,
  minVolume: number = 100_000
): Promise<{ gainers: LowFloatMover[]; losers: LowFloatMover[] }> {
  const [rawGainers, rawLosers] = await Promise.all([
    getTopGainers(),
    getTopLosers(),
  ]);

  const allMovers = [...rawGainers, ...rawLosers];

  // Pre-filter: skip warrants, require min volume
  const candidates = allMovers.filter((t) => {
    const vol = t.min?.av ?? t.day?.v ?? 0;
    return vol >= minVolume && !t.ticker.includes("W");
  });

  // Fetch real free float from FMP
  const tickerList = candidates.map((t) => t.ticker);
  const floatMap = await batchGetFreeFloat(tickerList);

  const lowFloat: LowFloatMover[] = [];

  for (const t of candidates) {
    const freeFloat = floatMap.get(t.ticker);
    if (freeFloat === undefined) continue;
    if (freeFloat < minFloat || freeFloat > maxFloat) continue;

    const price = t.lastTrade?.p ?? t.min?.c ?? t.prevDay?.c ?? 0;
    const vol = t.min?.av ?? t.day?.v ?? 0;

    lowFloat.push({
      ticker: t.ticker,
      price,
      changePercent: t.todaysChangePerc ?? 0,
      volume: vol,
      float: freeFloat,
    });
  }

  const gainers = lowFloat
    .filter((m) => m.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent);

  const losers = lowFloat
    .filter((m) => m.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent);

  return { gainers, losers };
}
