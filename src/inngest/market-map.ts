import { inngest } from "./client";
import { postEmbed } from "@/lib/discord";
import { buildMarketMap, type MarketMapSession } from "@/lib/market-map";
import { supabase } from "@/lib/supabase";
import { etCronPair, isMarketDay, isNearETTime } from "@/lib/market-hours";

async function logSuccess(action: string, details: Record<string, unknown>) {
  await supabase.from("bot_log").insert({
    module: "market-map",
    action,
    details,
  });
}

async function postMarketMap(session: MarketMapSession) {
  const { embed, summary } = await buildMarketMap(session);
  await postEmbed("premarket", embed);
  await logSuccess(session, summary);
  return summary;
}

function makeGuard(targetHour: number, targetMinute: number) {
  // Inngest's generated step type is verbose and SDK-version-sensitive.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (step: any) => {
    return step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      return isNearETTime(targetHour, targetMinute, 20);
    });
  };
}

const [premarket845EDT, premarket845EST] = etCronPair(8, 45);
const [open940EDT, open940EST] = etCronPair(9, 40);
const [midday1145EDT, midday1145EST] = etCronPair(11, 45);
const [close330EDT, close330EST] = etCronPair(15, 30);

export const marketMapPremarket = inngest.createFunction(
  {
    id: "market-map-premarket",
    retries: 2,
    triggers: [{ cron: premarket845EDT }, { cron: premarket845EST }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(8, 45)(step);
    if (!shouldRun) return { skipped: true };
    return postMarketMap("premarket");
  }
);

export const marketMapOpen = inngest.createFunction(
  {
    id: "market-map-open",
    retries: 2,
    triggers: [{ cron: open940EDT }, { cron: open940EST }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(9, 40)(step);
    if (!shouldRun) return { skipped: true };
    return postMarketMap("open");
  }
);

export const marketMapMidday = inngest.createFunction(
  {
    id: "market-map-midday",
    retries: 2,
    triggers: [{ cron: midday1145EDT }, { cron: midday1145EST }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(11, 45)(step);
    if (!shouldRun) return { skipped: true };
    return postMarketMap("midday");
  }
);

export const marketMapClose = inngest.createFunction(
  {
    id: "market-map-close",
    retries: 2,
    triggers: [{ cron: close330EDT }, { cron: close330EST }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(15, 30)(step);
    if (!shouldRun) return { skipped: true };
    return postMarketMap("close");
  }
);
