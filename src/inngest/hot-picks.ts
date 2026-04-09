import { inngest } from "./client";
import { getLowFloatMovers } from "@/lib/polygon";
import type { LowFloatMover } from "@/lib/polygon";
import { postEmbed } from "@/lib/discord";
import { supabase } from "@/lib/supabase";
import {
  isMarketDay,
  isNearETTime,
  etCron,
} from "@/lib/market-hours";
import {
  formatPrice,
  formatChange,
  formatVolume,
  COLORS,
} from "@/lib/embeds";
import { getEasternTimeString, getFormattedDate } from "@/lib/market-hours";
import type { DiscordEmbed } from "@/types/market";

// ── Helpers ────────────────────────────────────────────────────────

type SessionType = "premarket" | "after-hours";

function formatHotPickLine(m: LowFloatMover, rank: number): string {
  const floatStr = formatVolume(m.float);
  return `${rank}. **${m.ticker}**  ${formatChange(m.changePercent)}  ${formatPrice(m.price)}  Float: ${floatStr}  Vol: ${formatVolume(m.volume)}`;
}

const ANALYSIS_GUIDE = [
  "**How to analyse these picks:**",
  "1. **Float < 10M** = higher volatility, faster moves",
  "2. **Volume vs Float** — if volume > float, shares are churning (momentum play)",
  "3. **% Change > 20%** — look for a catalyst (news, earnings, FDA, contract)",
  "4. **Check the chart** — is it at resistance or breaking out of a range?",
  "5. **Risk first** — low floats move fast both ways. Set a stop loss before entry",
  "6. **Time of day matters** — premarket = less liquidity, wider spreads. After-hours = same",
].join("\n");

function buildHotPicksEmbed(
  session: SessionType,
  gainers: LowFloatMover[],
  losers: LowFloatMover[]
): DiscordEmbed {
  const label = session === "premarket"
    ? "PRE-MARKET HOT PICKS"
    : "AFTER-HOURS HOT PICKS";

  const fields: { name: string; value: string }[] = [];

  if (gainers.length > 0) {
    fields.push({
      name: "🚀 LOW FLOAT GAINERS",
      value: gainers
        .slice(0, 10)
        .map((m, i) => formatHotPickLine(m, i + 1))
        .join("\n"),
    });
  }

  if (losers.length > 0) {
    fields.push({
      name: "💥 LOW FLOAT LOSERS",
      value: losers
        .slice(0, 10)
        .map((m, i) => formatHotPickLine(m, i + 1))
        .join("\n"),
    });
  }

  if (gainers.length === 0 && losers.length === 0) {
    fields.push({
      name: "📭 No movers",
      value: "No low-float stocks meeting thresholds right now.",
    });
  }

  fields.push({
    name: "📖 QUICK ANALYSIS GUIDE",
    value: ANALYSIS_GUIDE,
  });

  return {
    title: `🔥 ${label} — ${getFormattedDate()}`,
    description:
      "Low-float stocks with unusual volume. These are high-risk, high-reward setups — always manage your risk.",
    color: COLORS.YELLOW,
    fields,
    footer: { text: `Polygon.io • ${getEasternTimeString()}` },
  };
}

async function fetchAndPostHotPicks(
  step: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  session: SessionType
): Promise<void> {
  const { gainers, losers } = await step.run("fetch-low-float", async () => {
    const { data: lfConfig } = await supabase
      .from("bot_config")
      .select("key, value")
      .like("key", "lowfloat.%");
    const lf: Record<string, string> = {};
    for (const row of lfConfig ?? []) lf[row.key] = row.value;

    const minFloat = parseInt(lf["lowfloat.min_float"] ?? "100000", 10);
    const minVol = parseInt(lf["lowfloat.min_volume"] ?? "100000", 10);
    const minChange = parseFloat(lf["lowfloat.min_change_pct"] ?? "5");

    // Pre-market: float up to 100M | After-hours: float up to 1B
    const maxFloat = session === "premarket"
      ? parseInt(lf["lowfloat.max_float_premarket"] ?? "100000000", 10)
      : parseInt(lf["lowfloat.max_float_afterhours"] ?? "1000000000", 10);

    return getLowFloatMovers(minFloat, maxFloat, minVol, minChange);
  });

  const embed = buildHotPicksEmbed(session, gainers, losers);

  await step.run("post-to-discord", async () => {
    await postEmbed("hot-picks", embed);
  });

  await step.run("log-success", async () => {
    await supabase.from("bot_log").insert({
      module: "hot-picks",
      action: `${session}-scan`,
      details: { gainers: gainers.length, losers: losers.length },
    });
  });
}

function makeGuard(targetETHour: number, targetETMinute: number = 0) {
  return async (step: any): Promise<boolean> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      return isNearETTime(targetETHour, targetETMinute);
    });
    return shouldRun;
  };
}

// ── Pre-market scans: 4:30, 5:30, 6:30, 7:30 AM ET ───────────────

const premarket430Cron = etCron(4, 30);
export const hotPicksPremarket430 = inngest.createFunction(
  {
    id: "hot-picks-premarket-430",
    retries: 3,
    triggers: [{ cron: premarket430Cron }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(4, 30)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostHotPicks(step, "premarket");
    return { posted: "premarket-430" };
  }
);

const premarket530Cron = etCron(5, 30);
export const hotPicksPremarket530 = inngest.createFunction(
  {
    id: "hot-picks-premarket-530",
    retries: 3,
    triggers: [{ cron: premarket530Cron }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(5, 30)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostHotPicks(step, "premarket");
    return { posted: "premarket-530" };
  }
);

const premarket630Cron = etCron(6, 30);
export const hotPicksPremarket630 = inngest.createFunction(
  {
    id: "hot-picks-premarket-630",
    retries: 3,
    triggers: [{ cron: premarket630Cron }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(6, 30)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostHotPicks(step, "premarket");
    return { posted: "premarket-630" };
  }
);

const premarket730Cron = etCron(7, 30);
export const hotPicksPremarket730 = inngest.createFunction(
  {
    id: "hot-picks-premarket-730",
    retries: 3,
    triggers: [{ cron: premarket730Cron }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(7, 30)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostHotPicks(step, "premarket");
    return { posted: "premarket-730" };
  }
);

// ── After-hours scans: 4:30, 5:30, 6:30, 7:30 PM ET ──────────────

const afterHours1630Cron = etCron(16, 30);
export const hotPicksAfterHours1630 = inngest.createFunction(
  {
    id: "hot-picks-after-hours-1630",
    retries: 3,
    triggers: [{ cron: afterHours1630Cron }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(16, 30)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostHotPicks(step, "after-hours");
    return { posted: "after-hours-1630" };
  }
);

const afterHours1730Cron = etCron(17, 30);
export const hotPicksAfterHours1730 = inngest.createFunction(
  {
    id: "hot-picks-after-hours-1730",
    retries: 3,
    triggers: [{ cron: afterHours1730Cron }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(17, 30)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostHotPicks(step, "after-hours");
    return { posted: "after-hours-1730" };
  }
);

const afterHours1830Cron = etCron(18, 30);
export const hotPicksAfterHours1830 = inngest.createFunction(
  {
    id: "hot-picks-after-hours-1830",
    retries: 3,
    triggers: [{ cron: afterHours1830Cron }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(18, 30)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostHotPicks(step, "after-hours");
    return { posted: "after-hours-1830" };
  }
);

const afterHours1930Cron = etCron(19, 30);
export const hotPicksAfterHours1930 = inngest.createFunction(
  {
    id: "hot-picks-after-hours-1930",
    retries: 3,
    triggers: [{ cron: afterHours1930Cron }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(19, 30)(step);
    if (!shouldRun) return { skipped: true, reason: "DST dedup or not market day" };
    await fetchAndPostHotPicks(step, "after-hours");
    return { posted: "after-hours-1930" };
  }
);
