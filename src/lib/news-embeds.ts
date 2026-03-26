/**
 * Embed builders for the News and Political News modules.
 */

import type { DiscordEmbed } from "@/types/market";
import type { ScoredArticle, NewsTag } from "@/types/news";
import { COLORS } from "@/lib/embeds";
import { getEasternTimeString } from "@/lib/market-hours";

// ── Tag emoji mapping ───────────────────────────────────────────────

const TAG_EMOJI: Record<NewsTag, string> = {
  earnings: "📊",
  fed: "🏛️",
  upgrade: "📈",
  ma: "🤝",
  legal: "⚖️",
  fda: "💊",
  management: "👔",
  dividend: "💰",
  warning: "📉",
  tariff: "🏷️",
  regulation: "📜",
  geopolitical: "🌍",
  general: "📰",
};

const TAG_LABEL: Record<NewsTag, string> = {
  earnings: "Earnings",
  fed: "Fed/Macro",
  upgrade: "Upgrade/Downgrade",
  ma: "M&A",
  legal: "Legal/SEC",
  fda: "FDA",
  management: "Management",
  dividend: "Dividend",
  warning: "Warning",
  tariff: "Tariff/Trade",
  regulation: "Regulation",
  geopolitical: "Geopolitical",
  general: "General",
};

// ── Company / Macro News Embed ──────────────────────────────────────

export function buildNewsEmbed(article: ScoredArticle): DiscordEmbed {
  const isBreaking = article.score >= 70;
  const color = isBreaking ? COLORS.RED : COLORS.BLUE;
  const breakingPrefix = isBreaking ? "🚨 " : "";

  const tickerDisplay = article.tickers.length > 0
    ? article.tickers.join(", ")
    : "General";

  const fields = [
    { name: "Source", value: article.source, inline: true },
    { name: "Tickers", value: tickerDisplay, inline: true },
    {
      name: "Tag",
      value: `${TAG_EMOJI[article.tag]} ${TAG_LABEL[article.tag]}`,
      inline: true,
    },
  ];

  return {
    title: `${breakingPrefix}${article.tickers[0] ?? "MARKET"} — ${truncate(article.headline, 200)}`,
    color,
    description: article.summary ? truncate(article.summary, 300) : undefined,
    fields,
    url: article.url,
    footer: { text: `Finnhub • ${getEasternTimeString()}` },
  };
}

// ── Political News Embed ────────────────────────────────────────────

export function buildPoliticalNewsEmbed(
  headline: string,
  summary: string,
  source: string,
  url: string,
  impactTickers?: { bullish: string[]; bearish: string[] },
  sectors?: string[]
): DiscordEmbed {
  const fields = [
    { name: "Source", value: source, inline: true },
  ];

  if (impactTickers) {
    const impacts: string[] = [];
    if (impactTickers.bullish.length > 0) {
      impacts.push(`Bullish: ${impactTickers.bullish.join(", ")}`);
    }
    if (impactTickers.bearish.length > 0) {
      impacts.push(`Bearish: ${impactTickers.bearish.join(", ")}`);
    }
    if (impacts.length > 0) {
      fields.push({
        name: "Market Impact",
        value: impacts.join(". "),
        inline: false,
      });
    }
  }

  if (sectors && sectors.length > 0) {
    fields.push({
      name: "Sectors",
      value: sectors.join(", "),
      inline: true,
    });
  }

  return {
    title: `🇺🇸 ${truncate(headline, 230)}`,
    color: COLORS.POLITICS,
    description: summary ? truncate(summary, 400) : undefined,
    fields,
    url,
    footer: { text: `Politics • ${getEasternTimeString()}` },
  };
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + "...";
}
