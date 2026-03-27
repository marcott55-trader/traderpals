import { inngest } from "./client";
import { postEmbed } from "@/lib/discord";
import { buildSectorBreadthEmbed, type SectorBreadthSession } from "@/lib/sector-breadth";
import { supabase } from "@/lib/supabase";
import { etCronPair, isMarketDay, isNearETTime } from "@/lib/market-hours";

async function logSuccess(action: string, details: Record<string, unknown>) {
  await supabase.from("bot_log").insert({
    module: "sector-breadth",
    action,
    details,
  });
}

async function postSectorBreadth(session: SectorBreadthSession) {
  const { embed, summary } = await buildSectorBreadthEmbed(session);
  await postEmbed("premarket", embed);
  await logSuccess(session, summary);
  return summary;
}

function makeGuard(targetHour: number, targetMinute: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (step: any) => {
    return step.run("check-schedule", async () => {
      if (!isMarketDay()) return false;
      return isNearETTime(targetHour, targetMinute, 20);
    });
  };
}

const [premarket835EDT, premarket835EST] = etCronPair(8, 35);
const [open1000EDT, open1000EST] = etCronPair(10, 0);
const [midday1215EDT, midday1215EST] = etCronPair(12, 15);
const [close345EDT, close345EST] = etCronPair(15, 45);

export const sectorBreadthPremarket = inngest.createFunction(
  {
    id: "sector-breadth-premarket",
    retries: 2,
    triggers: [{ cron: premarket835EDT }, { cron: premarket835EST }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(8, 35)(step);
    if (!shouldRun) return { skipped: true };
    return postSectorBreadth("premarket");
  }
);

export const sectorBreadthOpen = inngest.createFunction(
  {
    id: "sector-breadth-open",
    retries: 2,
    triggers: [{ cron: open1000EDT }, { cron: open1000EST }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(10, 0)(step);
    if (!shouldRun) return { skipped: true };
    return postSectorBreadth("open");
  }
);

export const sectorBreadthMidday = inngest.createFunction(
  {
    id: "sector-breadth-midday",
    retries: 2,
    triggers: [{ cron: midday1215EDT }, { cron: midday1215EST }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(12, 15)(step);
    if (!shouldRun) return { skipped: true };
    return postSectorBreadth("midday");
  }
);

export const sectorBreadthClose = inngest.createFunction(
  {
    id: "sector-breadth-close",
    retries: 2,
    triggers: [{ cron: close345EDT }, { cron: close345EST }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(15, 45)(step);
    if (!shouldRun) return { skipped: true };
    return postSectorBreadth("close");
  }
);
