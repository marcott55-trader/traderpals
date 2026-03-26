import { NextResponse } from "next/server";

// All env vars that must be set for the app to function
const REQUIRED_ENV_VARS = [
  // Supabase
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  // Inngest
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  // Market data
  "FINNHUB_API_KEY",
  "POLYGON_API_KEY",
  // Discord webhooks (all channels)
  "DISCORD_WEBHOOK_PREMARKET",
  "DISCORD_WEBHOOK_NEWS",
  "DISCORD_WEBHOOK_POLITICS",
  "DISCORD_WEBHOOK_ECON_CALENDAR",
  "DISCORD_WEBHOOK_EARNINGS",
  "DISCORD_WEBHOOK_ALERTS",
  "DISCORD_WEBHOOK_FLOW",
  "DISCORD_WEBHOOK_BOT_LOGS",
  // Discord app (slash commands)
  "DISCORD_APP_ID",
  "DISCORD_PUBLIC_KEY",
  "DISCORD_BOT_TOKEN",
] as const;

export async function GET() {
  const checks: Record<string, string> = {};

  // Check each required env var
  const missingVars: string[] = [];
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }
  checks.env_vars =
    missingVars.length === 0
      ? "all configured"
      : `missing: ${missingVars.join(", ")}`;

  // Check Supabase connectivity
  try {
    const { supabase } = await import("@/lib/supabase");
    const { error } = await supabase
      .from("watchlist")
      .select("ticker")
      .limit(1);

    checks.supabase = error ? `error: ${error.message}` : "connected";
  } catch (err) {
    checks.supabase = `error: ${err instanceof Error ? err.message : "unknown"}`;
  }

  const allOk =
    missingVars.length === 0 && checks.supabase === "connected";

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  );
}
