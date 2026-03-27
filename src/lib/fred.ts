/**
 * FRED API Client (Federal Reserve Economic Data)
 *
 * Free API from the St. Louis Fed. Provides release schedules
 * for all major US economic data: CPI, NFP, GDP, PPI, etc.
 *
 * Replaces Finnhub's premium-only economic calendar.
 */

const FRED_API = "https://api.stlouisfed.org/fred";

function getApiKey(): string {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("Missing FRED_API_KEY");
  return key;
}

// High-impact release IDs we care about
const HIGH_IMPACT_RELEASES: Record<number, { name: string; impact: string; why: string }> = {
  10:  { name: "CPI", impact: "high", why: "Measures inflation. Higher = Fed hikes = bearish. Lower = dovish = bullish." },
  46:  { name: "PPI", impact: "high", why: "Producer prices — upstream inflation signal. Leads CPI." },
  50:  { name: "Jobs Report (NFP)", impact: "high", why: "Non-farm payrolls. Strong = economy healthy but Fed may tighten." },
  53:  { name: "GDP", impact: "high", why: "Economic growth rate. Below 0% = recession signal." },
  101: { name: "FOMC Statement", impact: "high", why: "Fed rate decision. THE most important event for markets." },
  180: { name: "Jobless Claims", impact: "medium", why: "Weekly labor market pulse. Spiking claims = recession fears." },
  194: { name: "ADP Employment", impact: "medium", why: "Private payrolls preview — often moves markets before NFP." },
  323: { name: "PCE Inflation", impact: "high", why: "Fed's preferred inflation gauge. Moves slower than CPI but Fed watches it more." },
  386: { name: "GDPNow", impact: "medium", why: "Atlanta Fed's real-time GDP tracker. Early signal for GDP prints." },
};

const MEDIUM_IMPACT_RELEASES: Record<number, { name: string; impact: string }> = {
  11:  { name: "Employment Cost Index", impact: "medium" },
  92:  { name: "Retail Sales", impact: "medium" },
  148: { name: "Building Permits", impact: "low" },
  296: { name: "Housing Vacancies", impact: "low" },
};

const ALL_TRACKED = { ...HIGH_IMPACT_RELEASES, ...MEDIUM_IMPACT_RELEASES };

export interface EconRelease {
  releaseId: number;
  name: string;
  date: string; // YYYY-MM-DD
  impact: string; // high, medium, low
  why?: string;
}

/**
 * Get upcoming economic releases for a date range.
 * Returns only the releases we track (high + medium impact).
 */
export async function getUpcomingReleases(
  from: string,
  to: string
): Promise<EconRelease[]> {
  const apiKey = getApiKey();
  const url = `${FRED_API}/releases/dates?realtime_start=${from}&realtime_end=${to}&api_key=${apiKey}&file_type=json&include_release_dates_with_no_data=true`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED API error: ${res.status}`);

  const data = await res.json();
  const releaseDates: Array<{ release_id: number; date: string }> = data.release_dates ?? [];

  const results: EconRelease[] = [];

  for (const rd of releaseDates) {
    const tracked = ALL_TRACKED[rd.release_id];
    if (!tracked) continue;

    const high = HIGH_IMPACT_RELEASES[rd.release_id];

    results.push({
      releaseId: rd.release_id,
      name: tracked.name,
      date: rd.date,
      impact: tracked.impact,
      why: high?.why,
    });
  }

  // Sort by impact (high first) then date
  const impactOrder = { high: 0, medium: 1, low: 2 };
  results.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (impactOrder[a.impact as keyof typeof impactOrder] ?? 3) -
           (impactOrder[b.impact as keyof typeof impactOrder] ?? 3);
  });

  return results;
}

/**
 * Get today's economic releases.
 */
export async function getTodaysReleases(dateStr: string): Promise<EconRelease[]> {
  return getUpcomingReleases(dateStr, dateStr);
}

/**
 * Get this week's economic releases (Mon-Fri).
 */
export async function getWeekReleases(
  mondayStr: string,
  fridayStr: string
): Promise<EconRelease[]> {
  return getUpcomingReleases(mondayStr, fridayStr);
}
