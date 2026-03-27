import { inngest } from "./client";
import { getTopGainers, getTopLosers, getLowFloatMovers } from "@/lib/polygon";
import type { LowFloatMover } from "@/lib/polygon";
import { getFuturesQuotes } from "@/lib/finnhub";
import { postEmbed } from "@/lib/discord";
import {
  buildPremarketEmbed,
  buildMarketOpenEmbed,
  buildIntradayEmbed,
  buildCloseEmbed,
  buildAfterHoursEmbed,
} from "@/lib/embeds";
import { supabase } from "@/lib/supabase";
import {
  isMarketDay,
  isNearETTime,
  getEasternTime,
  etCron,
  etIntervalCron,
} from "@/lib/market-hours";
import type { MarketMover, FuturesQuote, PolygonSnapshotTicker } from "@/types/market";

// ── Shared helpers ──────────────────────────────────────────────────

type EmbedType = "premarket" | "premarket-update" | "open" | "intraday" | "close" | "after-hours";

async function getWatchlistTickers(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("watchlist")
    .select("ticker, tier");

  if (error)
    throw new Error(`Supabase watchlist query failed: ${error.message}`);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.ticker, row.tier);
  }
  return map;
}

interface MoversConfig {
  minChangePct: number;
  minPrice: number;
  maxResults: number;
  minVolume: number;
}

async function getMoversConfig(): Promise<MoversConfig> {
  const { data } = await supabase
    .from("bot_config")
    .select("key, value")
    .like("key", "movers.%");

  const config: Record<string, string> = {};
  for (const row of data ?? []) {
    config[row.key] = row.value;
  }

  return {
    minChangePct: parseFloat(config["movers.min_change_pct"] ?? "0.5"),
    minPrice: parseFloat(config["movers.min_price"] ?? "5"),
    maxResults: parseInt(config["movers.max_results"] ?? "10", 10),
    minVolume: parseInt(config["movers.min_volume"] ?? "0", 10),
  };
}

function sortByAbsChange(movers: MarketMover[]): MarketMover[] {
  return [...movers].sort(
    (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)
  );
}

async function logSuccess(action: string, details: Record<string, unknown>) {
  await supabase.from("bot_log").insert({
    module: "market-movers",
    action,
    details,
  });
}

function snapshotToMover(
  t: PolygonSnapshotTicker,
  watchlist: Map<string, string>
): MarketMover {
  return {
    ticker: t.ticker,
    price: t.lastTrade?.p ?? t.day?.c ?? 0,
    changePercent: t.todaysChangePerc ?? 0,
    volume: t.day?.v || t.min?.av || 0, // day.v is 0 pre-market, use min.av
    isWatchlist: watchlist.has(t.ticker),
    tier: watchlist.get(t.ticker) ?? null,
  };
}

/** Fetch broad market movers from Polygon (real gainers/losers, not just watchlist) */
async function fetchMarketMovers(
  watchlist: Map<string, string>,
  config: MoversConfig
): Promise<{ gainers: MarketMover[]; losers: MarketMover[] }> {
  const [rawGainers, rawLosers] = await Promise.all([
    getTopGainers(),
    getTopLosers(),
  ]);

  const allMovers = [
    ...rawGainers.map((t) => snapshotToMover(t, watchlist)),
    ...rawLosers.map((t) => snapshotToMover(t, watchlist)),
  ];

  // Apply configurable filters
  const filtered = allMovers.filter((m) => {
    if (m.price < config.minPrice) return false;
    if (Math.abs(m.changePercent) < config.minChangePct) return false;
    if (config.minVolume > 0 && m.volume < config.minVolume) return false;
    return true;
  });

  const gainers = sortByAbsChange(
    filtered.filter((m) => m.changePercent > 0)
  ).slice(0, config.maxResults);

  const losers = sortByAbsChange(
    filtered.filter((m) => m.changePercent < 0)
  ).slice(0, config.maxResults);

  return { gainers, losers };
}

// ── Core function: fetch movers and post ────────────────────────────

async function fetchAndPostMovers(
  // Inngest's step type is complex and version-dependent; any is intentional here
  step: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  embedType: EmbedType
): Promise<void> {
  const watchlistEntries: [string, string][] = await step.run(
    "fetch-watchlist",
    async () => {
      const wl = await getWatchlistTickers();
      return Array.from(wl.entries());
    }
  );
  const watchlistMap = new Map<string, string>(watchlistEntries);

  // Fetch futures for premarket and premarket-update
  let futures: FuturesQuote[] = [];
  if (embedType === "premarket" || embedType === "premarket-update") {
    futures = await step.run("fetch-futures", async () => {
      return getFuturesQuotes();
    });
  }

  // Load configurable filters from Supabase
  const config: MoversConfig = await step.run("load-config", async () => {
    return getMoversConfig();
  });

  // Fetch broad market movers from Polygon (real gainers/losers)
  const { gainers, losers } = await step.run(
    "fetch-movers",
    async () => {
      return fetchMarketMovers(watchlistMap, config);
    }
  );

  // Fetch low float movers for premarket and after-hours
  let lowFloatGainers: LowFloatMover[] = [];
  let lowFloatLosers: LowFloatMover[] = [];
  if (embedType === "premarket" || embedType === "premarket-update" || embedType === "after-hours") {
    const lowFloat = await step.run("fetch-low-float", async () => {
      // Read configurable float/volume thresholds from Supabase
      const { data: lfConfig } = await supabase
        .from("bot_config")
        .select("key, value")
        .like("key", "lowfloat.%");
      const lf: Record<string, string> = {};
      for (const row of lfConfig ?? []) lf[row.key] = row.value;

      const minFloat = parseInt(lf["lowfloat.min_float"] ?? "100000", 10);
      const maxFloat = parseInt(lf["lowfloat.max_float"] ?? "20000000", 10);
      const minVol = parseInt(lf["lowfloat.min_volume"] ?? "100000", 10);

      return getLowFloatMovers(minFloat, maxFloat, minVol);
    });
    lowFloatGainers = lowFloat.gainers;
    lowFloatLosers = lowFloat.losers;
  }

  // Build the correct embed for this schedule
  let embed;
  switch (embedType) {
    case "premarket":
      embed = buildPremarketEmbed(futures, gainers, losers, false, lowFloatGainers, lowFloatLosers);
      break;
    case "premarket-update":
      embed = buildPremarketEmbed(futures, gainers, losers, true, lowFloatGainers, lowFloatLosers);
      break;
    case "open":
      embed = buildMarketOpenEmbed(gainers, losers);
      break;
    case "intraday":
      embed = buildIntradayEmbed(gainers, losers);
      break;
    case "close":
      embed = buildCloseEmbed(gainers, losers);
      break;
    case "after-hours":
      embed = buildAfterHoursEmbed(gainers, losers, lowFloatGainers, lowFloatLosers);
      break;
  }

  await step.run("post-to-discord", async () => {
    await postEmbed("premarket", embed);
  });

  await step.run("log-success", async () => {
    await logSuccess(embedType, {
      gainersCount: gainers.length,
      losersCount: losers.length,
      futuresCount: futures.length,
    });
  });
}

// ── Guard: skip if not the right ET time (DST dedup) ────────────────

function makeGuard(targetETHour: number, targetETMinute: number = 0) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (step: any): Promise<boolean> => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      return isNearETTime(targetETHour, targetETMinute);
    });
    return shouldRun;
  };
}

// ── Inngest Functions ───────────────────────────────────────────────
// Each function registers TWO crons (EDT + EST). The guard function
// checks whether the current ET time matches the intended schedule,
// so only the correct cron actually executes.

// 7:00 AM ET — Pre-market snapshot
const premarket7amCron = etCron(7, 0);
export const premarketMovers = inngest.createFunction(
  {
    id: "premarket-movers",
    retries: 3,
    triggers: [{ cron: premarket7amCron }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(7, 0)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostMovers(step, "premarket");
    return { posted: "premarket-7am" };
  }
);

// 8:45 AM ET — Final pre-market game plan
const premarket845Cron = etCron(8, 45);
export const premarketUpdate = inngest.createFunction(
  {
    id: "premarket-update",
    retries: 3,
    triggers: [{ cron: premarket845Cron }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(8, 45)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostMovers(step, "premarket-update");
    return { posted: "premarket-845" };
  }
);

// 9:35 AM ET — Market open snapshot after the first shakeout
const open935Cron = etCron(9, 35);
export const marketOpenMovers = inngest.createFunction(
  {
    id: "market-open-movers",
    retries: 3,
    triggers: [{ cron: open935Cron }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(9, 35)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostMovers(step, "open");
    return { posted: "open" };
  }
);

// Every 60 min, 10:00 AM – 3:00 PM ET — Intraday scan
// Unlike fixed-time jobs, interval crons have overlapping UTC hour ranges
// during the "wrong" DST period. We must check that the current ET hour
// falls within 10-15 AND that the DST offset matches this invocation's cron.
const intradayCron = etIntervalCron(60, 10, 15);
export const intradayMovers = inngest.createFunction(
  {
    id: "intraday-movers",
    retries: 3,
    triggers: [{ cron: intradayCron }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      const { hour } = getEasternTime();
      return hour >= 10 && hour <= 15;
    });
    if (!shouldRun) return { skipped: true, reason: "not market day or outside window" };
    await fetchAndPostMovers(step, "intraday");
    return { posted: "intraday" };
  }
);

// 3:55 PM ET — Market close summary before the bell
const close355Cron = etCron(15, 55);
export const marketCloseMovers = inngest.createFunction(
  {
    id: "market-close-movers",
    retries: 3,
    triggers: [{ cron: close355Cron }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(15, 55)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostMovers(step, "close");
    return { posted: "close" };
  }
);

// 4:10 PM ET — After-hours movers
const ah410Cron = etCron(16, 10);
export const afterHoursMovers = inngest.createFunction(
  {
    id: "after-hours-movers",
    retries: 3,
    triggers: [{ cron: ah410Cron }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(16, 10)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostMovers(step, "after-hours");
    return { posted: "after-hours" };
  }
);
