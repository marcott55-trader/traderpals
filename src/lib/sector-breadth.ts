import { COLORS, formatChange, formatPrice } from "@/lib/embeds";
import { getEasternTimeString, getFormattedDate } from "@/lib/market-hours";
import { getTickerSnapshots } from "@/lib/polygon";
import type { DiscordEmbed, PolygonSnapshotTicker } from "@/types/market";

export type SectorBreadthSession = "premarket" | "open" | "midday" | "close";

interface SectorSnapshot {
  ticker: string;
  name: string;
  theme: "index" | "sector";
  changePercent: number;
  price: number;
}

const MARKET_PROXY_TICKERS = [
  { ticker: "SPY", name: "S&P 500", theme: "index" as const },
  { ticker: "QQQ", name: "Nasdaq 100", theme: "index" as const },
  { ticker: "IWM", name: "Russell 2000", theme: "index" as const },
  { ticker: "DIA", name: "Dow", theme: "index" as const },
  { ticker: "XLK", name: "Technology", theme: "sector" as const },
  { ticker: "XLF", name: "Financials", theme: "sector" as const },
  { ticker: "XLE", name: "Energy", theme: "sector" as const },
  { ticker: "XLV", name: "Healthcare", theme: "sector" as const },
  { ticker: "XLI", name: "Industrials", theme: "sector" as const },
  { ticker: "XLY", name: "Consumer Disc.", theme: "sector" as const },
  { ticker: "XLP", name: "Consumer Staples", theme: "sector" as const },
  { ticker: "XLU", name: "Utilities", theme: "sector" as const },
  { ticker: "XLB", name: "Materials", theme: "sector" as const },
  { ticker: "XLC", name: "Communication", theme: "sector" as const },
  { ticker: "SMH", name: "Semis", theme: "sector" as const },
];

function sessionTitle(session: SectorBreadthSession): string {
  switch (session) {
    case "premarket":
      return "PREMARKET BREADTH";
    case "open":
      return "OPENING BREADTH";
    case "midday":
      return "MIDDAY BREADTH";
    case "close":
      return "CLOSING BREADTH";
  }
}

function snapshotToSector(
  snapshot: PolygonSnapshotTicker,
  metadata: typeof MARKET_PROXY_TICKERS[number]
): SectorSnapshot {
  return {
    ticker: snapshot.ticker,
    name: metadata.name,
    theme: metadata.theme,
    changePercent: snapshot.todaysChangePerc ?? 0,
    price: snapshot.lastTrade?.p ?? snapshot.day?.c ?? snapshot.min?.c ?? 0,
  };
}

function formatLine(snapshot: SectorSnapshot): string {
  return `**${snapshot.ticker}** ${formatChange(snapshot.changePercent)} ${formatPrice(snapshot.price)} — ${snapshot.name}`;
}

function getBreadthLabel(indexes: SectorSnapshot[], sectors: SectorSnapshot[]): string {
  const greenIndexes = indexes.filter((snapshot) => snapshot.changePercent > 0).length;
  const greenSectors = sectors.filter((snapshot) => snapshot.changePercent > 0).length;

  if (greenIndexes >= 3 && greenSectors >= 7) return "Broad Risk-On";
  if (greenIndexes <= 1 && greenSectors <= 3) return "Broad Risk-Off";
  if (greenIndexes >= 3 && greenSectors <= 5) return "Index-Led Narrow Strength";
  if (greenIndexes <= 1 && greenSectors >= 6) return "Defensive Rotation";
  return "Mixed Rotation";
}

function getLeadershipNote(label: string, leaders: SectorSnapshot[], laggards: SectorSnapshot[]): string {
  const topLeader = leaders[0]?.name ?? "n/a";
  const topLaggard = laggards[0]?.name ?? "n/a";

  switch (label) {
    case "Broad Risk-On":
      return `Participation is healthy. Leadership is coming from ${topLeader}, while ${topLaggard} is lagging most.`;
    case "Broad Risk-Off":
      return `Selling is broad. Watch whether ${topLaggard} keeps dragging the tape and whether ${topLeader} is just a defensive hideout.`;
    case "Index-Led Narrow Strength":
      return `Indexes are green but breadth is narrow. ${topLeader} is doing the heavy lifting while ${topLaggard} is leaking.`;
    case "Defensive Rotation":
      return `Money is rotating rather than expanding. Keep an eye on ${topLeader} as the relative-strength pocket.`;
    default:
      return `Tape is mixed. ${topLeader} is leading and ${topLaggard} is lagging, so stay selective by sector.`;
  }
}

export async function buildSectorBreadthEmbed(
  session: SectorBreadthSession
): Promise<{ embed: DiscordEmbed; summary: { breadth: string; leaderCount: number; laggardCount: number } }> {
  const snapshots = await getTickerSnapshots(MARKET_PROXY_TICKERS.map((item) => item.ticker));
  const byTicker = new Map(snapshots.map((snapshot) => [snapshot.ticker, snapshot]));

  const rows = MARKET_PROXY_TICKERS
    .map((item) => {
      const snapshot = byTicker.get(item.ticker);
      return snapshot ? snapshotToSector(snapshot, item) : null;
    })
    .filter(Boolean) as SectorSnapshot[];

  const indexes = rows.filter((row) => row.theme === "index");
  const sectors = rows.filter((row) => row.theme === "sector");
  const leaders = [...sectors].sort((a, b) => b.changePercent - a.changePercent).slice(0, 4);
  const laggards = [...sectors].sort((a, b) => a.changePercent - b.changePercent).slice(0, 4);
  const breadth = getBreadthLabel(indexes, sectors);
  const note = getLeadershipNote(breadth, leaders, laggards);

  const embed: DiscordEmbed = {
    title: `🧱 ${sessionTitle(session)} — ${getFormattedDate()}`,
    color: breadth.includes("Risk-On") ? COLORS.GREEN : breadth.includes("Risk-Off") ? COLORS.RED : COLORS.YELLOW,
    fields: [
      {
        name: "Tape Read",
        value: `**${breadth}**\n${note}`,
      },
      {
        name: "Index Check",
        value: indexes.map(formatLine).join("\n"),
      },
      {
        name: "Sector Leaders",
        value: leaders.length > 0 ? leaders.map(formatLine).join("\n") : "No leaders available",
      },
      {
        name: "Sector Laggards",
        value: laggards.length > 0 ? laggards.map(formatLine).join("\n") : "No laggards available",
      },
    ],
    footer: { text: `Sector Breadth • ${getEasternTimeString()}` },
  };

  return {
    embed,
    summary: {
      breadth,
      leaderCount: leaders.length,
      laggardCount: laggards.length,
    },
  };
}
