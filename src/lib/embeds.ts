import type {
  DiscordEmbed,
  MarketMover,
  FuturesQuote,
} from "@/types/market";
import type { LowFloatMover } from "@/lib/polygon";
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
  const vol = m.volume > 0 ? `  Vol: ${formatVolume(m.volume)}` : "";
  return `${rank}. ${star}${m.ticker}  ${formatChange(m.changePercent)}  ${formatPrice(m.price)}${vol}`;
}

function buildWatchlistFocusField(
  gainers: MarketMover[],
  losers: MarketMover[]
): { name: string; value: string } | null {
  const watchlistMovers = [...gainers, ...losers]
    .filter((m) => m.isWatchlist)
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 8);

  if (watchlistMovers.length === 0) return null;

  return {
    name: "⭐ WATCHLIST IN PLAY",
    value: watchlistMovers
      .map((m, i) => formatMoverLine(m, i + 1))
      .join("\n"),
  };
}

function formatLowFloatLine(m: LowFloatMover, rank: number): string {
  const floatStr = formatVolume(m.float);
  return `${rank}. **${m.ticker}**  ${formatChange(m.changePercent)}  ${formatPrice(m.price)}  Float: ${floatStr}  Vol: ${formatVolume(m.volume)}`;
}

function buildLowFloatFields(
  gainers: LowFloatMover[],
  losers: LowFloatMover[]
): { name: string; value: string }[] {
  const fields: { name: string; value: string }[] = [];

  if (gainers.length > 0) {
    fields.push({
      name: "🚀 LOW FLOAT GAINERS",
      value: gainers
        .slice(0, 10)
        .map((m, i) => formatLowFloatLine(m, i + 1))
        .join("\n"),
    });
  }

  if (losers.length > 0) {
    fields.push({
      name: "💥 LOW FLOAT LOSERS",
      value: losers
        .slice(0, 10)
        .map((m, i) => formatLowFloatLine(m, i + 1))
        .join("\n"),
    });
  }

  return fields;
}

export function buildPremarketEmbed(
  futures: FuturesQuote[],
  gainers: MarketMover[],
  losers: MarketMover[],
  isUpdate: boolean = false,
  lowFloatGainers: LowFloatMover[] = [],
  lowFloatLosers: LowFloatMover[] = []
): DiscordEmbed {
  const fields = [];
  const watchlistField = buildWatchlistFocusField(gainers, losers);

  if (watchlistField) fields.push(watchlistField);

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
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  if (losers.length > 0) {
    fields.push({
      name: `${tickerEmoji(-1)} TOP LOSERS`,
      value: losers
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  fields.push(...buildLowFloatFields(lowFloatGainers, lowFloatLosers));

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
  const watchlistField = buildWatchlistFocusField(gainers, losers);

  if (watchlistField) fields.push(watchlistField);

  if (gainers.length > 0) {
    fields.push({
      name: `${tickerEmoji(1)} OPENING GAINERS`,
      value: gainers
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  if (losers.length > 0) {
    fields.push({
      name: `${tickerEmoji(-1)} OPENING LOSERS`,
      value: losers
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  return {
    title: `📊 WATCHLIST AT OPEN — ${getFormattedDate()}`,
    color: COLORS.BLUE,
    fields,
    footer: { text: `Finnhub • ${getEasternTimeString()}` },
  };
}

export function buildIntradayEmbed(
  gainers: MarketMover[],
  losers: MarketMover[]
): DiscordEmbed {
  const fields = [];
  const watchlistField = buildWatchlistFocusField(gainers, losers);

  if (watchlistField) fields.push(watchlistField);

  if (gainers.length > 0) {
    fields.push({
      name: `${tickerEmoji(1)} INTRADAY GAINERS`,
      value: gainers
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  if (losers.length > 0) {
    fields.push({
      name: `${tickerEmoji(-1)} INTRADAY LOSERS`,
      value: losers
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  return {
    title: `📊 WATCHLIST INTRADAY — ${getFormattedDate()}`,
    color: COLORS.BLUE,
    fields,
    footer: { text: `Finnhub • ${getEasternTimeString()}` },
  };
}

export function buildCloseEmbed(
  gainers: MarketMover[],
  losers: MarketMover[]
): DiscordEmbed {
  const fields = [];
  const watchlistField = buildWatchlistFocusField(gainers, losers);

  if (watchlistField) fields.push(watchlistField);

  if (gainers.length > 0) {
    fields.push({
      name: `${tickerEmoji(1)} TOP GAINERS TODAY`,
      value: gainers
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  if (losers.length > 0) {
    fields.push({
      name: `${tickerEmoji(-1)} TOP LOSERS TODAY`,
      value: losers
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  return {
    title: `📊 WATCHLIST AT CLOSE — ${getFormattedDate()}`,
    color: COLORS.BLUE,
    fields,
    footer: { text: `Finnhub • ${getEasternTimeString()}` },
  };
}

export function buildAfterHoursEmbed(
  gainers: MarketMover[],
  losers: MarketMover[],
  lowFloatGainers: LowFloatMover[] = [],
  lowFloatLosers: LowFloatMover[] = []
): DiscordEmbed {
  const fields = [];
  const watchlistField = buildWatchlistFocusField(gainers, losers);

  if (watchlistField) fields.push(watchlistField);

  if (gainers.length > 0) {
    fields.push({
      name: `${tickerEmoji(1)} AFTER-HOURS GAINERS`,
      value: gainers
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  if (losers.length > 0) {
    fields.push({
      name: `${tickerEmoji(-1)} AFTER-HOURS LOSERS`,
      value: losers
        .map((m, i) => formatMoverLine(m, i + 1))
        .join("\n"),
    });
  }

  fields.push(...buildLowFloatFields(lowFloatGainers, lowFloatLosers));

  return {
    title: `📊 WATCHLIST AFTER-HOURS — ${getFormattedDate()}`,
    color: COLORS.BLUE,
    fields,
    footer: { text: `Finnhub • ${getEasternTimeString()}` },
  };
}
