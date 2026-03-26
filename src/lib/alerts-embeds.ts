/**
 * Embed builders for Price Alerts and Flow/Sentiment modules.
 */

import type { DiscordEmbed } from "@/types/market";
import type { PriceAlertRow, UnusualOptions, RedditMention, ShortInterestData } from "@/types/alerts";
import { COLORS, formatPrice, formatChange, formatVolume } from "@/lib/embeds";
import { getEasternTimeString, getFormattedDate } from "@/lib/market-hours";

// ── Price Alert Triggered ───────────────────────────────────────────

export function buildAlertTriggeredEmbed(
  alert: PriceAlertRow,
  currentPrice: number,
  sessionChange: number,
  volume: number
): DiscordEmbed {
  const isBullish = alert.alert_type === "above" || sessionChange > 0;
  const color = isBullish ? COLORS.GREEN : COLORS.RED;

  const descriptionMap: Record<string, string> = {
    above: `${alert.ticker} just broke above your ${formatPrice(alert.level!)} level`,
    below: `${alert.ticker} just dropped below your ${formatPrice(alert.level!)} level`,
    ma_cross: `${alert.ticker} just crossed the ${alert.ma_period}-day moving average`,
    vwap: `${alert.ticker} just crossed VWAP`,
    pct_move: `${alert.ticker} moved ${formatChange(sessionChange)} today`,
  };

  const titleMap: Record<string, string> = {
    above: `ALERT: ${alert.ticker} > ${formatPrice(alert.level!)}`,
    below: `ALERT: ${alert.ticker} < ${formatPrice(alert.level!)}`,
    ma_cross: `ALERT: ${alert.ticker} × ${alert.ma_period}-day MA`,
    vwap: `ALERT: ${alert.ticker} × VWAP`,
    pct_move: `ALERT: ${alert.ticker} ${formatChange(sessionChange)} today`,
  };

  const fields = [
    { name: "Current Price", value: formatPrice(currentPrice), inline: true },
    { name: "Session Change", value: formatChange(sessionChange), inline: true },
  ];

  if (volume > 0) {
    fields.push({ name: "Volume", value: formatVolume(volume), inline: true });
  }

  if (alert.discord_username) {
    fields.push({ name: "Set By", value: `@${alert.discord_username}`, inline: true });
  }

  return {
    title: `🔔 ${titleMap[alert.alert_type] ?? `ALERT: ${alert.ticker}`}`,
    color,
    description: descriptionMap[alert.alert_type] ?? "",
    fields,
    footer: { text: `Alert #${alert.id} • Triggered ${getEasternTimeString()}` },
  };
}

// ── Unusual Options Activity ────────────────────────────────────────

export function buildUnusualOptionsEmbed(options: UnusualOptions): DiscordEmbed {
  const signalEmoji = options.signal === "bullish" ? "🟢" : options.signal === "bearish" ? "🔴" : "⚪";
  const activityType = options.callVolume > options.putVolume
    ? "Heavy call buying"
    : "Heavy put buying";

  return {
    title: `🔮 Unusual Options: ${options.ticker}`,
    color: COLORS.PURPLE,
    fields: [
      { name: "Activity", value: activityType, inline: true },
      {
        name: "Volume vs OI",
        value: `${formatVolume(options.totalVolume)} (OI: ${formatVolume(options.openInterest)}) — ${options.volumeToOI.toFixed(1)}x`,
        inline: false,
      },
      { name: "Signal", value: `${signalEmoji} ${options.signal.charAt(0).toUpperCase() + options.signal.slice(1)}`, inline: true },
    ],
    footer: { text: `Options Flow • ${getEasternTimeString()}` },
  };
}

// ── Reddit Sentiment Spike ──────────────────────────────────────────

export function buildRedditSentimentEmbed(mention: RedditMention): DiscordEmbed {
  return {
    title: `📱 Social Buzz: ${mention.ticker}`,
    color: COLORS.PURPLE,
    fields: [
      {
        name: "Reddit Mentions (24h)",
        value: `${mention.mentions24h} (avg: ${mention.avgMentions7d})`,
        inline: true,
      },
      {
        name: "Sentiment",
        value: `${mention.sentimentBullish}% bullish`,
        inline: true,
      },
      {
        name: "Spike",
        value: `${mention.spikeMultiple.toFixed(1)}x above average`,
        inline: true,
      },
    ],
    footer: { text: `Reddit • ${getEasternTimeString()}` },
  };
}

// ── Short Interest Summary ──────────────────────────────────────────

export function buildShortInterestEmbed(data: ShortInterestData[]): DiscordEmbed {
  const highSI = data.filter((d) => d.shortPercentFloat >= 20);
  const moderate = data.filter((d) => d.shortPercentFloat >= 10 && d.shortPercentFloat < 20);

  const fields = [];

  if (highSI.length > 0) {
    fields.push({
      name: "🔴 HIGH SHORT INTEREST (>20% float)",
      value: highSI
        .map((d) => `**${d.ticker}** — ${d.shortPercentFloat.toFixed(1)}% SI, ${d.daysToCover.toFixed(1)} DTC`)
        .join("\n"),
    });
  }

  if (moderate.length > 0) {
    fields.push({
      name: "🟡 MODERATE SHORT INTEREST (10-20% float)",
      value: moderate
        .map((d) => `**${d.ticker}** — ${d.shortPercentFloat.toFixed(1)}% SI, ${d.daysToCover.toFixed(1)} DTC`)
        .join("\n"),
    });
  }

  if (fields.length === 0) {
    fields.push({
      name: "No High SI",
      value: "No watchlist tickers with notable short interest.",
    });
  }

  return {
    title: `📊 SHORT INTEREST — ${getFormattedDate()}`,
    color: COLORS.PURPLE,
    fields,
    footer: { text: `Finnhub • ${getEasternTimeString()}` },
  };
}
