import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const CONFIG_RULES = {
  "movers.min_change_pct": { min: 0, max: 50, integer: false },
  "movers.min_price": { min: 0, max: 10000, integer: false },
  "movers.max_results": { min: 1, max: 25, integer: true },
  "movers.min_volume": { min: 0, max: 1000000000, integer: true },
  "news.score_threshold": { min: 0, max: 100, integer: true },
  "news.max_per_cycle": { min: 1, max: 10, integer: true },
  "news.lookback_minutes": { min: 5, max: 240, integer: true },
  "politics.score_threshold": { min: 0, max: 100, integer: true },
  "politics.max_per_cycle": { min: 1, max: 10, integer: true },
  "lowfloat.min_float": { min: 0, max: 1000000000, integer: true },
  "lowfloat.max_float": { min: 0, max: 1000000000, integer: true },
  "lowfloat.min_volume": { min: 0, max: 1000000000, integer: true },
  "flow.min_short_pct": { min: 0, max: 100, integer: false },
  "flow.reddit_spike_threshold": { min: 1, max: 50, integer: false },
  "flow.reddit_min_mentions": { min: 1, max: 10000, integer: true },
} as const;

function validateConfigValue(
  key: keyof typeof CONFIG_RULES,
  rawValue: string
): string | null {
  const rule = CONFIG_RULES[key];
  const numeric = Number(rawValue);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (rule.integer && !Number.isInteger(numeric)) {
    return null;
  }

  if (numeric < rule.min || numeric > rule.max) {
    return null;
  }

  return String(numeric);
}

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

  const rows = [];

  for (const [key, value] of Object.entries(body)) {
    if (!(key in CONFIG_RULES)) {
      return NextResponse.json({ error: `unknown config key: ${key}` }, { status: 400 });
    }

    const normalizedValue = validateConfigValue(
      key as keyof typeof CONFIG_RULES,
      String(value)
    );

    if (normalizedValue == null) {
      return NextResponse.json({ error: `invalid value for ${key}` }, { status: 400 });
    }

    rows.push({ key, value: normalizedValue });
  }

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
