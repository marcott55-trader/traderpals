import type {
  DiscordEmbed,
  MarketMover,
  FuturesQuote,
} from "@/types/market";
import { getEasternTimeString, getFormattedDate } from "@/lib/market-hours";

// Canonical color palette — all modules use these
export const COLORS = {
  GREEN: 0x00ff00,
  RED: 0xff0000,
  BLUE: 0x0099ff,
  YELLOW: 0xffcc00,
  PURPLE: 0x9b59b6,
  POLITICS: 0x3c3b6e,
} as const;

// ── Formatting helpers ──────────────────────────────────────────────

export function formatPrice(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function formatChange(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function formatVolume(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function tickerEmoji(change: number): string {
  return change >= 0 ? "🟢" : "🔴";
}

// ── Market Movers Embeds ────────────────────────────────────────────

function formatFuturesLine(q: FuturesQuote): string {
  return `${q.name}  ${formatPrice(q.price)}  ${formatChange(q.changePercent)}`;
}

function formatMoverLine(m: MarketMover, rank: number): string {
  const star = m.isWatchlist ? "⭐ " : "";
  return `${rank}. ${star}${m.ticker}  ${formatChange(m.changePercent)}  ${formatPrice(m.price)}  Vol: ${formatVolume(m.volume)}`;
}

export function buildPremarketEmbed(
  futures: FuturesQuote[],
  gainers: MarketMover[],
  losers: MarketMover[],
  isUpdate: boolean = false
): DiscordEmbed {
  const fields = [];

  if (futures.length > 0) {
    fields.push({
      name: "🔹 FUTURES",
      value: futures.map(formatFuturesLine).join("\n"),
    });
  }

  if (gainers.length > 0) {
    fields.push({
      name: `${tickerEmoji(1)} TOP GAINERS`,
      value: gainers
        .slice(0, 10)
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  if (losers.length > 0) {
    fields.push({
      name: `${tickerEmoji(-1)} TOP LOSERS`,
      value: losers
        .slice(0, 10)
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  const label = isUpdate ? "PRE-MARKET UPDATE" : "PRE-MARKET MOVERS";
  return {
    title: `📊 ${label} — ${getFormattedDate()}`,
    color: COLORS.BLUE,
    fields,
    footer: { text: `Polygon.io • ${getEasternTimeString()}` },
  };
}

export function buildMarketOpenEmbed(
  gainers: MarketMover[],
  losers: MarketMover[]
): DiscordEmbed {
  const fields = [];

  if (gainers.length > 0) {
    fields.push({
      name: `${tickerEmoji(1)} OPENING GAINERS`,
      value: gainers
        .slice(0, 10)
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  if (losers.length > 0) {
    fields.push({
      name: `${tickerEmoji(-1)} OPENING LOSERS`,
      value: losers
        .slice(0, 10)
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  return {
    title: `📊 MARKET OPEN — ${getFormattedDate()}`,
    color: COLORS.BLUE,
    fields,
    footer: { text: `Polygon.io • ${getEasternTimeString()}` },
  };
}

export function buildIntradayEmbed(
  gainers: MarketMover[],
  losers: MarketMover[]
): DiscordEmbed {
  const fields = [];

  if (gainers.length > 0) {
    fields.push({
      name: `${tickerEmoji(1)} INTRADAY GAINERS`,
      value: gainers
        .slice(0, 10)
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  if (losers.length > 0) {
    fields.push({
      name: `${tickerEmoji(-1)} INTRADAY LOSERS`,
      value: losers
        .slice(0, 10)
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  return {
    title: `📊 INTRADAY SCAN — ${getFormattedDate()}`,
    color: COLORS.BLUE,
    fields,
    footer: { text: `Polygon.io • ${getEasternTimeString()}` },
  };
}

export function buildCloseEmbed(
  gainers: MarketMover[],
  losers: MarketMover[]
): DiscordEmbed {
  const fields = [];

  if (gainers.length > 0) {
    fields.push({
      name: `${tickerEmoji(1)} TOP GAINERS TODAY`,
      value: gainers
        .slice(0, 10)
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  if (losers.length > 0) {
    fields.push({
      name: `${tickerEmoji(-1)} TOP LOSERS TODAY`,
      value: losers
        .slice(0, 10)
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  return {
    title: `📊 MARKET CLOSE — ${getFormattedDate()}`,
    color: COLORS.BLUE,
    fields,
    footer: { text: `Polygon.io • ${getEasternTimeString()}` },
  };
}

export function buildAfterHoursEmbed(
  gainers: MarketMover[],
  losers: MarketMover[]
): DiscordEmbed {
  const fields = [];

  if (gainers.length > 0) {
    fields.push({
      name: `${tickerEmoji(1)} AFTER-HOURS GAINERS`,
      value: gainers
        .slice(0, 10)
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  if (losers.length > 0) {
    fields.push({
      name: `${tickerEmoji(-1)} AFTER-HOURS LOSERS`,
      value: losers
        .slice(0, 10)
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  return {
    title: `📊 AFTER-HOURS MOVERS — ${getFormattedDate()}`,
    color: COLORS.BLUE,
    fields,
    footer: { text: `Polygon.io • ${getEasternTimeString()}` },
  };
}
