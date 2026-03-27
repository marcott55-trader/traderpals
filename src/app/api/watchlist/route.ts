import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { hasCompanyProfile } from "@/lib/finnhub";
import {
  isValidTickerFormat,
  isValidWatchlistTier,
  normalizeTicker,
} from "@/lib/tickers";

/** GET /api/watchlist — return all watchlist rows */
export async function GET() {
  const { data, error } = await supabase
    .from("watchlist")
    .select("ticker, tier, added_at")
    .order("tier")
    .order("ticker");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

/** POST /api/watchlist — add a ticker
 *  Body: { "ticker": "AAPL", "tier": "tier1" }
 */
export async function POST(req: NextRequest) {
  const { ticker, tier } = await req.json();

  if (!ticker || typeof ticker !== "string") {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const cleanTicker = normalizeTicker(ticker);
  const cleanTier = typeof tier === "string" ? tier : "custom";

  if (!isValidTickerFormat(cleanTicker)) {
    return NextResponse.json({ error: "invalid ticker format" }, { status: 400 });
  }

  if (!isValidWatchlistTier(cleanTier)) {
    return NextResponse.json({ error: "invalid tier" }, { status: 400 });
  }

  if (!(await hasCompanyProfile(cleanTicker))) {
    return NextResponse.json({ error: `ticker ${cleanTicker} was not recognized` }, { status: 400 });
  }

  const { error } = await supabase
    .from("watchlist")
    .upsert(
      { ticker: cleanTicker, tier: cleanTier },
      { onConflict: "ticker" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ticker: cleanTicker });
}

/** DELETE /api/watchlist?ticker=AAPL — remove a ticker */
export async function DELETE(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");

  if (!ticker) {
    return NextResponse.json(
      { error: "ticker query param required" },
      { status: 400 }
    );
  }

  const cleanTicker = normalizeTicker(ticker);
  if (!isValidTickerFormat(cleanTicker)) {
    return NextResponse.json({ error: "invalid ticker format" }, { status: 400 });
  }

  const { error } = await supabase
    .from("watchlist")
    .delete()
    .eq("ticker", cleanTicker);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: cleanTicker });
}
