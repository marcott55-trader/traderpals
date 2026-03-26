import { inngest } from "./client";
import { getQuote, getFuturesQuotes } from "@/lib/finnhub";
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
  isEDT,
  getEasternTime,
  etCronPair,
  etIntervalCronPair,
} from "@/lib/market-hours";
import type { MarketMover, FuturesQuote } from "@/types/market";

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

/** Fetch Finnhub quotes for all watchlist tickers and split into gainers/losers */
async function fetchMoversFromWatchlist(
  tickers: string[],
  watchlist: Map<string, string>,
  config: MoversConfig
): Promise<{ gainers: MarketMover[]; losers: MarketMover[] }> {
  const movers: MarketMover[] = [];

  // Fetch quotes in parallel (batches of 10 to respect rate limits)
  const batchSize = 10;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const quotes = await Promise.allSettled(
      batch.map(async (ticker) => {
        const q = await getQuote(ticker);
        return { ticker, quote: q };
      })
    );

    for (const result of quotes) {
      if (result.status === "rejected") continue;
      const { ticker, quote } = result.value;
      if (!quote.c || quote.c === 0) continue;

      movers.push({
        ticker,
        price: quote.c,
        changePercent: quote.dp ?? 0,
        volume: 0, // Finnhub quote doesn't include volume
        isWatchlist: watchlist.has(ticker),
        tier: watchlist.get(ticker) ?? null,
      });
    }

    if (i + batchSize < tickers.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Apply configurable filters
  const filtered = movers.filter((m) => {
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

  // Fetch quotes for all watchlist tickers via Finnhub
  const { gainers, losers } = await step.run(
    "fetch-movers",
    async () => {
      const tickers = Array.from(watchlistMap.keys());
      return fetchMoversFromWatchlist(tickers, watchlistMap, config);
    }
  );

  // Build the correct embed for this schedule
  let embed;
  switch (embedType) {
    case "premarket":
      embed = buildPremarketEmbed(futures, gainers, losers);
      break;
    case "premarket-update":
      embed = buildPremarketEmbed(futures, gainers, losers, true);
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
      embed = buildAfterHoursEmbed(gainers, losers);
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
const [premarket7amEDT, premarket7amEST] = etCronPair(7, 0);
export const premarketMovers = inngest.createFunction(
  {
    id: "premarket-movers",
    retries: 3,
    triggers: [{ cron: premarket7amEDT }, { cron: premarket7amEST }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(7, 0)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostMovers(step, "premarket");
    return { posted: "premarket-7am" };
  }
);

// 8:00 AM ET — Pre-market update (refreshed movers)
const [premarket8amEDT, premarket8amEST] = etCronPair(8, 0);
export const premarketUpdate = inngest.createFunction(
  {
    id: "premarket-update",
    retries: 3,
    triggers: [{ cron: premarket8amEDT }, { cron: premarket8amEST }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(8, 0)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostMovers(step, "premarket-update");
    return { posted: "premarket-8am" };
  }
);

// 9:30 AM ET — Market open snapshot
const [open930EDT, open930EST] = etCronPair(9, 30);
export const marketOpenMovers = inngest.createFunction(
  {
    id: "market-open-movers",
    retries: 3,
    triggers: [{ cron: open930EDT }, { cron: open930EST }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(9, 30)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostMovers(step, "open");
    return { posted: "open" };
  }
);

// Every 30 min, 10:00 AM – 3:30 PM ET — Intraday scan
// Unlike fixed-time jobs, interval crons have overlapping UTC hour ranges
// during the "wrong" DST period. We must check that the current ET hour
// falls within 10-15 AND that the DST offset matches this invocation's cron.
const [intradayEDT, intradayEST] = etIntervalCronPair(30, 10, 15);
export const intradayMoversEDT = inngest.createFunction(
  {
    id: "intraday-movers-edt",
    retries: 3,
    triggers: [{ cron: intradayEDT }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      if (!isEDT()) return false; // Only run during EDT months
      const { hour } = getEasternTime();
      return hour >= 10 && hour <= 15;
    });
    if (!shouldRun) return { skipped: true, reason: "not EDT, not market day, or outside window" };
    await fetchAndPostMovers(step, "intraday");
    return { posted: "intraday" };
  }
);

export const intradayMoversEST = inngest.createFunction(
  {
    id: "intraday-movers-est",
    retries: 3,
    triggers: [{ cron: intradayEST }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      if (isEDT()) return false; // Only run during EST months
      const { hour } = getEasternTime();
      return hour >= 10 && hour <= 15;
    });
    if (!shouldRun) return { skipped: true, reason: "not EST, not market day, or outside window" };
    await fetchAndPostMovers(step, "intraday");
    return { posted: "intraday" };
  }
);

// 4:00 PM ET — Market close summary
const [close4pmEDT, close4pmEST] = etCronPair(16, 0);
export const marketCloseMovers = inngest.createFunction(
  {
    id: "market-close-movers",
    retries: 3,
    triggers: [{ cron: close4pmEDT }, { cron: close4pmEST }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(16, 0)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostMovers(step, "close");
    return { posted: "close" };
  }
);

// 4:15 PM ET — After-hours movers
const [ah415EDT, ah415EST] = etCronPair(16, 15);
export const afterHoursMovers = inngest.createFunction(
  {
    id: "after-hours-movers",
    retries: 3,
    triggers: [{ cron: ah415EDT }, { cron: ah415EST }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(16, 15)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostMovers(step, "after-hours");
    return { posted: "after-hours" };
  }
);
