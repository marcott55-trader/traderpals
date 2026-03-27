/**
 * FINRA Short Volume Parser
 *
 * FINRA publishes daily short volume data as free CSV files.
 * Source: https://cdn.finra.org/equity/regsho/daily/
 * File format: CNMSshvol{YYYYMMDD}.txt (pipe-delimited)
 *
 * Columns: Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market
 */

export interface ShortVolumeData {
  ticker: string;
  shortVolume: number;
  totalVolume: number;
  shortPercent: number; // shortVolume / totalVolume * 100
}

/**
 * Fetch yesterday's FINRA short volume data for specific tickers.
 * FINRA data is published next-day (T+1).
 */
export async function fetchShortVolume(
  tickers: string[]
): Promise<ShortVolumeData[]> {
  // Try yesterday first, then day before (weekends/holidays)
  const dates = getRecentBusinessDates(3);

  for (const dateStr of dates) {
    try {
      const data = await fetchForDate(dateStr, tickers);
      if (data.length > 0) return data;
    } catch {
      // Try next date
    }
  }

  return [];
}

async function fetchForDate(
  dateStr: string,
  tickers: string[]
): Promise<ShortVolumeData[]> {
  const url = `https://cdn.finra.org/equity/regsho/daily/CNMSshvol${dateStr}.txt`;
  const res = await fetch(url, {
    headers: { "User-Agent": "traderpals-bot/1.0" },
  });

  if (!res.ok) {
    throw new Error(`FINRA fetch failed: ${res.status}`);
  }

  const text = await res.text();
  const tickerSet = new Set(tickers.map((t) => t.toUpperCase()));
  const results: ShortVolumeData[] = [];

  const lines = text.split("\n");
  for (const line of lines) {
    const parts = line.split("|");
    if (parts.length < 5) continue;

    const symbol = parts[1]?.trim();
    if (!symbol || !tickerSet.has(symbol)) continue;

    const shortVolume = parseInt(parts[2], 10) || 0;
    const shortExempt = parseInt(parts[3], 10) || 0;
    const totalVolume = parseInt(parts[4], 10) || 0;

    if (totalVolume === 0) continue;

    const totalShort = shortVolume + shortExempt;
    results.push({
      ticker: symbol,
      shortVolume: totalShort,
      totalVolume,
      shortPercent: (totalShort / totalVolume) * 100,
    });
  }

  // Sort by short percent descending
  return results.sort((a, b) => b.shortPercent - a.shortPercent);
}

/**
 * Get recent business dates as YYYYMMDD strings (excluding weekends).
 */
function getRecentBusinessDates(count: number): string[] {
  const dates: string[] = [];
  const now = new Date();

  for (let i = 1; dates.length < count; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const day = d.getDay();
    if (day === 0 || day === 6) continue; // skip weekends

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dates.push(`${yyyy}${mm}${dd}`);
  }

  return dates;
}
