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
