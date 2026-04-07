import type { DiscordEmbed } from "@/types/market";

export type Channel =
  | "premarket"
  | "news"
  | "politics"
  | "econ-calendar"
  | "earnings"
  | "alerts"
  | "flow"
  | "quiz"
  | "hot-picks"
  | "bot-logs";

const WEBHOOK_ENV_MAP: Record<Channel, string> = {
  premarket: "DISCORD_WEBHOOK_PREMARKET",
  news: "DISCORD_WEBHOOK_NEWS",
  politics: "DISCORD_WEBHOOK_POLITICS",
  "econ-calendar": "DISCORD_WEBHOOK_ECON_CALENDAR",
  earnings: "DISCORD_WEBHOOK_EARNINGS",
  alerts: "DISCORD_WEBHOOK_ALERTS",
  flow: "DISCORD_WEBHOOK_FLOW",
  quiz: "DISCORD_WEBHOOK_QUIZ",
  "hot-picks": "DISCORD_WEBHOOK_HOT_PICKS",
  "bot-logs": "DISCORD_WEBHOOK_BOT_LOGS",
};

function getWebhookUrl(channel: Channel): string {
  const envVar = WEBHOOK_ENV_MAP[channel];
  const url = process.env[envVar];
  if (!url) {
    throw new Error(`Missing env var ${envVar} for channel #${channel}`);
  }
  return url;
}

/** Post one or more embeds to a Discord channel via webhook */
export async function postEmbed(
  channel: Channel,
  embeds: DiscordEmbed | DiscordEmbed[]
): Promise<void> {
  const url = getWebhookUrl(channel);
  const embedArray = Array.isArray(embeds) ? embeds : [embeds];

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: embedArray }),
  });

  // Handle rate limiting with one retry
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 5000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    const retry = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: embedArray }),
    });

    if (!retry.ok) {
      throw new Error(
        `Discord webhook failed after retry: ${retry.status} ${retry.statusText}`
      );
    }
    return;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Discord webhook failed: ${response.status} ${response.statusText} — ${body}`
    );
  }
}

/** Post a plain text message to a Discord channel */
export async function postMessage(
  channel: Channel,
  content: string
): Promise<void> {
  const url = getWebhookUrl(channel);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error(
      `Discord webhook failed: ${response.status} ${response.statusText}`
    );
  }
}

/** Convenience: post an error/info message to #bot-logs */
export async function logToDiscord(
  module: string,
  message: string
): Promise<void> {
  try {
    await postMessage("bot-logs", `**[${module}]** ${message}`);
  } catch {
    // If we can't even log to Discord, just console.error
    console.error(`[${module}] Failed to log to Discord: ${message}`);
  }
}
