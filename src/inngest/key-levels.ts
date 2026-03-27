import { inngest } from "./client";
import { postEmbed } from "@/lib/discord";
import { buildKeyLevelsEmbed, type KeyLevelsSession } from "@/lib/key-levels";
import { supabase } from "@/lib/supabase";
import { etCronPair, isMarketDay, isNearETTime } from "@/lib/market-hours";

async function logSuccess(action: string, details: Record<string, unknown>) {
  await supabase.from("bot_log").insert({
    module: "key-levels",
    action,
    details,
  });
}

async function postKeyLevels(session: KeyLevelsSession) {
  const { embed, summary } = await buildKeyLevelsEmbed(session);
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

const [premarket850EDT, premarket850EST] = etCronPair(8, 50);
const [open1005EDT, open1005EST] = etCronPair(10, 5);
const [midday1230EDT, midday1230EST] = etCronPair(12, 30);

export const keyLevelsPremarket = inngest.createFunction(
  {
    id: "key-levels-premarket",
    retries: 2,
    triggers: [{ cron: premarket850EDT }, { cron: premarket850EST }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(8, 50)(step);
    if (!shouldRun) return { skipped: true };
    return postKeyLevels("premarket");
  }
);

export const keyLevelsOpen = inngest.createFunction(
  {
    id: "key-levels-open",
    retries: 2,
    triggers: [{ cron: open1005EDT }, { cron: open1005EST }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(10, 5)(step);
    if (!shouldRun) return { skipped: true };
    return postKeyLevels("open");
  }
);

export const keyLevelsMidday = inngest.createFunction(
  {
    id: "key-levels-midday",
    retries: 2,
    triggers: [{ cron: midday1230EDT }, { cron: midday1230EST }],
  },
  async ({ step }) => {
    const shouldRun = await makeGuard(12, 30)(step);
    if (!shouldRun) return { skipped: true };
    return postKeyLevels("midday");
  }
);
