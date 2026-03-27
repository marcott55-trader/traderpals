import type { PolygonSnapshotResponse, PolygonSnapshotTicker } from "@/types/market";

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

// ── Ticker Details (for float/shares outstanding) ───────────────────

interface PolygonTickerDetails {
  results?: {
    share_class_shares_outstanding?: number;
    weighted_shares_outstanding?: number;
    market_cap?: number;
    type?: string;
    name?: string;
  };
}

/** Get shares outstanding (float proxy) for a ticker */
export async function getSharesOutstanding(
  ticker: string
): Promise<number | null> {
  try {
    const data = await polygonFetch<PolygonTickerDetails>(
      `/v3/reference/tickers/${encodeURIComponent(ticker)}`
    );
    return data.results?.share_class_shares_outstanding ?? null;
  } catch {
    return null;
  }
}

/** Batch fetch shares outstanding for multiple tickers */
export async function batchGetSharesOutstanding(
  tickers: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  // Fetch in batches of 5 to stay within rate limits
  for (let i = 0; i < tickers.length; i += 5) {
    const batch = tickers.slice(i, i + 5);
    const promises = batch.map(async (ticker) => {
      const shares = await getSharesOutstanding(ticker);
      if (shares !== null) result.set(ticker, shares);
    });
    await Promise.allSettled(promises);

    if (i + 5 < tickers.length) {
      await new Promise((r) => setTimeout(r, 1200)); // Rate limit pause
    }
  }

  return result;
}

// ── Low Float Scanner ───────────────────────────────────────────────

export interface LowFloatMover {
  ticker: string;
  price: number;
  changePercent: number;
  volume: number;
  float: number;
}

/**
 * Scan Polygon gainers/losers for low-float stocks.
 * Filters: float 100K-20M, volume >= 100K, any price (including sub-penny).
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

  // Filter out warrants and tickers with no volume
  const candidates = allMovers.filter((t) => {
    const vol = t.min?.av ?? t.day?.v ?? 0;
    return vol >= minVolume && !t.ticker.includes("W");
  });

  // Fetch shares outstanding for candidates
  const tickerList = candidates.map((t) => t.ticker);
  const sharesMap = await batchGetSharesOutstanding(tickerList);

  const lowFloat: LowFloatMover[] = [];

  for (const t of candidates) {
    const shares = sharesMap.get(t.ticker);
    if (shares === undefined) continue;
    if (shares < minFloat || shares > maxFloat) continue;

    const price = t.lastTrade?.p ?? t.min?.c ?? t.prevDay?.c ?? 0;
    const vol = t.min?.av ?? t.day?.v ?? 0;

    lowFloat.push({
      ticker: t.ticker,
      price,
      changePercent: t.todaysChangePerc ?? 0,
      volume: vol,
      float: shares,
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
