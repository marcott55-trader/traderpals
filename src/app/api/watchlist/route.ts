import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

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

  const cleanTicker = ticker.trim().toUpperCase();

  const { error } = await supabase
    .from("watchlist")
    .upsert(
      { ticker: cleanTicker, tier: tier || "custom" },
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

  const { error } = await supabase
    .from("watchlist")
    .delete()
    .eq("ticker", ticker.toUpperCase());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: ticker.toUpperCase() });
}
