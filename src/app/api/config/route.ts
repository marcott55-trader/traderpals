import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/** GET /api/config — return all bot_config rows as { key: value } */
export async function GET() {
  const { data, error } = await supabase
    .from("bot_config")
    .select("key, value, description");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const config: Record<string, { value: string; description: string | null }> =
    {};
  for (const row of data ?? []) {
    config[row.key] = { value: row.value, description: row.description };
  }

  return NextResponse.json(config);
}

/** PUT /api/config — upsert one or more config keys
 *  Body: { "movers.min_price": "10", "news.score_threshold": "50" }
 */
export async function PUT(req: NextRequest) {
  const body: Record<string, string> = await req.json();

  const rows = Object.entries(body).map(([key, value]) => ({
    key,
    value: String(value),
  }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "No config keys provided" }, { status: 400 });
  }

  const { error } = await supabase
    .from("bot_config")
    .upsert(rows, { onConflict: "key" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: rows.length });
}
