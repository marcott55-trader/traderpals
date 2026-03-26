/**
 * Discord Interactions API Route
 *
 * Handles slash commands from Discord:
 *   /alert above NVDA 150
 *   /alert below TSLA 180
 *   /alert ma AAPL 50
 *   /alert vwap TSLA
 *   /alert move NVDA 5
 *   /alerts              — List active alerts
 *   /alert remove 3      — Remove alert by ID
 *   /alert clear          — Remove all user's alerts
 *
 * Discord sends HTTP POST requests here. We must:
 * 1. Verify the request signature
 * 2. Handle PING (type 1) for Discord URL verification
 * 3. Parse and execute commands (type 2)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { MAX_ALERTS_PER_USER, VALID_MA_PERIODS } from "@/types/alerts";
import type { AlertType } from "@/types/alerts";

// Discord interaction types
const INTERACTION_TYPE_PING = 1;
const INTERACTION_TYPE_COMMAND = 2;

// Discord response types
const RESPONSE_PONG = 1;
const RESPONSE_MESSAGE = 4;

// ── Signature verification ──────────────────────────────────────────

async function verifyDiscordSignature(
  request: NextRequest,
  body: string
): Promise<boolean> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) throw new Error("Missing DISCORD_PUBLIC_KEY");

  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");

  if (!signature || !timestamp) return false;

  try {
    const encoder = new TextEncoder();
    const keyBytes = hexToBytes(publicKey);
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes.buffer as ArrayBuffer,
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    const message = encoder.encode(timestamp + body);
    const sig = hexToBytes(signature);

    return await crypto.subtle.verify("Ed25519", key, sig.buffer as ArrayBuffer, message);
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ── Supabase client ─────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

// ── Command handlers ────────────────────────────────────────────────

interface CommandOption {
  name: string;
  value: string | number;
}

function respond(content: string) {
  return NextResponse.json({
    type: RESPONSE_MESSAGE,
    data: { content },
  });
}

async function handleAlertCommand(
  subcommand: string,
  options: CommandOption[],
  userId: string,
  username: string
): Promise<NextResponse> {
  const supabase = getSupabase();

  // Get option values as a map
  const opts = new Map(options.map((o) => [o.name, o.value]));

  switch (subcommand) {
    case "above":
    case "below": {
      const ticker = String(opts.get("ticker") ?? "").toUpperCase();
      const level = Number(opts.get("level"));

      if (!ticker || isNaN(level) || level <= 0) {
        return respond("Usage: /alert above TICKER PRICE");
      }

      // Check max alerts per user
      const { count } = await supabase
        .from("price_alerts")
        .select("id", { count: "exact", head: true })
        .eq("discord_user_id", userId)
        .eq("active", true);

      if ((count ?? 0) >= MAX_ALERTS_PER_USER) {
        return respond(`You have ${MAX_ALERTS_PER_USER} active alerts (max). Remove some first with \`/alert remove\`.`);
      }

      const { error } = await supabase.from("price_alerts").insert({
        ticker,
        alert_type: subcommand as AlertType,
        level,
        discord_user_id: userId,
        discord_username: username,
      });

      if (error) return respond("Failed to save alert. Please try again.");

      const direction = subcommand === "above" ? ">" : "<";
      return respond(`Alert set: **${ticker}** ${direction} **$${level.toFixed(2)}**`);
    }

    case "ma":
    case "vwap":
      return respond("MA cross and VWAP alerts are not yet supported. Coming soon.");

    case "move": {
      const ticker = String(opts.get("ticker") ?? "").toUpperCase();
      const pct = Number(opts.get("percent"));

      if (!ticker || isNaN(pct) || pct <= 0) {
        return respond("Usage: /alert move TICKER PERCENT");
      }

      const { error } = await supabase.from("price_alerts").insert({
        ticker,
        alert_type: "pct_move" as AlertType,
        level: pct,
        discord_user_id: userId,
        discord_username: username,
      });

      if (error) return respond("Failed to save alert. Please try again.");

      return respond(`Alert set: **${ticker}** moves **${pct}%** in a session`);
    }

    case "remove": {
      const alertId = Number(opts.get("id"));
      if (isNaN(alertId)) return respond("Usage: /alert remove ID");

      const { error } = await supabase
        .from("price_alerts")
        .delete()
        .eq("id", alertId)
        .eq("discord_user_id", userId); // Users can only remove their own

      if (error) return respond("Failed to remove alert.");
      return respond(`Alert #${alertId} removed.`);
    }

    case "clear": {
      const { count } = await supabase
        .from("price_alerts")
        .delete({ count: "exact" })
        .eq("discord_user_id", userId)
        .eq("active", true);

      return respond(`Cleared **${count ?? 0}** active alert${(count ?? 0) === 1 ? "" : "s"}.`);
    }

    default:
      return respond("Unknown subcommand. Try: above, below, ma, vwap, move, remove, clear");
  }
}

async function handleAlertsListCommand(userId: string): Promise<NextResponse> {
  const supabase = getSupabase();

  const { data: alerts } = await supabase
    .from("price_alerts")
    .select("*")
    .eq("discord_user_id", userId)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (!alerts || alerts.length === 0) {
    return respond("You have no active alerts. Set one with `/alert above TICKER PRICE`.");
  }

  const lines = alerts.map((a) => {
    const typeStr =
      a.alert_type === "above" ? `> $${a.level}` :
      a.alert_type === "below" ? `< $${a.level}` :
      a.alert_type === "ma_cross" ? `× ${a.ma_period}-day MA` :
      a.alert_type === "vwap" ? "× VWAP" :
      a.alert_type === "pct_move" ? `${a.level}% move` : a.alert_type;

    return `#${a.id}  **${a.ticker}** ${typeStr}`;
  });

  return respond(`**Your Active Alerts (${alerts.length}):**\n${lines.join("\n")}`);
}

// ── Main handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.text();

  // Verify Discord signature
  const isValid = await verifyDiscordSignature(request, body);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const interaction = JSON.parse(body);

  // Handle PING (Discord URL verification)
  if (interaction.type === INTERACTION_TYPE_PING) {
    return NextResponse.json({ type: RESPONSE_PONG });
  }

  // Handle slash commands
  if (interaction.type === INTERACTION_TYPE_COMMAND) {
    const commandName = interaction.data.name;
    const userId = interaction.member?.user?.id ?? interaction.user?.id;
    const username = interaction.member?.user?.username ?? interaction.user?.username ?? "unknown";
    const options = interaction.data.options ?? [];

    if (commandName === "alert") {
      const subcommand = options[0]?.name;
      const subOptions = options[0]?.options ?? [];
      return handleAlertCommand(subcommand, subOptions, userId, username);
    }

    if (commandName === "alerts") {
      return handleAlertsListCommand(userId);
    }

    return respond("Unknown command.");
  }

  return NextResponse.json({ error: "Unknown interaction type" }, { status: 400 });
}
