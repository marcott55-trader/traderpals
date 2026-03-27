/**
 * Price Alerts Module — #alerts
 *
 * Schedule:
 *   Every 1 min (9:30AM-4PM, weekdays)    — Price check (regular hours)
 *   Every 2 min (4-9:30AM, 4-8PM, weekdays) — Price check (extended hours)
 */

import { inngest } from "./client";
import { getQuote } from "@/lib/finnhub";
import { postEmbed } from "@/lib/discord";
import { buildAlertTriggeredEmbed } from "@/lib/alerts-embeds";
import { supabase } from "@/lib/supabase";
import {
  isMarketDay,
  isEDT,
  getEasternTime,
  etIntervalCronPair,
} from "@/lib/market-hours";
import type { PriceAlertRow } from "@/types/alerts";
import { ALERT_COOLDOWN_MINUTES } from "@/types/alerts";

// ── Shared helpers ──────────────────────────────────────────────────

async function logSuccess(action: string, details: Record<string, unknown>) {
  await supabase.from("bot_log").insert({
    module: "price-alerts",
    action,
    details,
  });
}

async function getActiveAlerts(): Promise<PriceAlertRow[]> {
  const { data, error } = await supabase
    .from("price_alerts")
    .select("*")
    .eq("active", true);

  if (error) throw new Error(`Failed to fetch alerts: ${error.message}`);
  return (data ?? []) as PriceAlertRow[];
}

function isAlertTriggered(
  alert: PriceAlertRow,
  currentPrice: number,
  prevClose: number
): boolean {
  switch (alert.alert_type) {
    case "above":
      return alert.level != null && currentPrice > alert.level;
    case "below":
      return alert.level != null && currentPrice < alert.level;
    case "pct_move": {
      if (alert.level == null || prevClose === 0) return false;
      const pctChange = Math.abs(((currentPrice - prevClose) / prevClose) * 100);
      return pctChange >= alert.level;
    }
    // MA cross and VWAP require historical data — simplified for V1
    case "ma_cross":
    case "vwap":
      return false; // TODO: implement with historical price data
    default:
      return false;
  }
}

function isInCooldown(alert: PriceAlertRow): boolean {
  if (!alert.triggered_at) return false;
  const triggeredAt = new Date(alert.triggered_at).getTime();
  const cooldownMs = ALERT_COOLDOWN_MINUTES * 60 * 1000;
  return Date.now() - triggeredAt < cooldownMs;
}

function isRegularSessionWindow(): boolean {
  const { hour, minute } = getEasternTime();
  const minutesSinceMidnight = hour * 60 + minute;
  return minutesSinceMidnight >= 570 && minutesSinceMidnight <= 960;
}

function isPremarketWindow(): boolean {
  const { hour, minute } = getEasternTime();
  const minutesSinceMidnight = hour * 60 + minute;
  return minutesSinceMidnight >= 240 && minutesSinceMidnight < 570;
}

function isAfterHoursWindow(): boolean {
  const { hour, minute } = getEasternTime();
  const minutesSinceMidnight = hour * 60 + minute;
  return minutesSinceMidnight >= 960 && minutesSinceMidnight < 1200;
}

// ── Core price check logic ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkPriceAlerts(step: any) {
  const triggered = await step.run("check-alerts", async () => {
    const alerts = await getActiveAlerts();
    if (alerts.length === 0) return 0;

    // Group alerts by ticker to minimize API calls
    const alertsByTicker = new Map<string, PriceAlertRow[]>();
    for (const alert of alerts) {
      if (isInCooldown(alert)) continue;
      const existing = alertsByTicker.get(alert.ticker) ?? [];
      existing.push(alert);
      alertsByTicker.set(alert.ticker, existing);
    }

    let triggeredCount = 0;

    // Process tickers in batches of 10
    const tickers = Array.from(alertsByTicker.keys());
    for (let i = 0; i < tickers.length; i += 10) {
      const batch = tickers.slice(i, i + 10);

      const quotes = await Promise.allSettled(
        batch.map(async (ticker) => {
          const q = await getQuote(ticker);
          return { ticker, quote: q };
        })
      );

      for (const result of quotes) {
        if (result.status === "rejected") continue;

        const { ticker, quote } = result.value;
        if (!quote.c || quote.c === 0) continue;

        const tickerAlerts = alertsByTicker.get(ticker) ?? [];
        const currentPrice = quote.c;
        const prevClose = quote.pc;
        const sessionChange = quote.dp ?? 0;

        for (const alert of tickerAlerts) {
          if (!isAlertTriggered(alert, currentPrice, prevClose)) continue;

          // Fire the alert
          const embed = buildAlertTriggeredEmbed(
            alert,
            currentPrice,
            sessionChange,
            0 // Volume not available from quote endpoint
          );
          await postEmbed("alerts", embed);

          // Mark as triggered (one-shot: deactivate)
          await supabase
            .from("price_alerts")
            .update({
              active: false,
              triggered_at: new Date().toISOString(),
            })
            .eq("id", alert.id);

          await logSuccess("alert-triggered", {
            alertId: alert.id,
            ticker: alert.ticker,
            type: alert.alert_type,
            level: alert.level,
            price: currentPrice,
          });

          triggeredCount++;
        }
      }

      // Rate limit pause
      if (i + 10 < tickers.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return triggeredCount;
  });

  return { triggered };
}

// ── Every 1 min (9:30AM-4PM) — Regular Hours Price Check ────────────

const [regularEDT, regularEST] = etIntervalCronPair(1, 9, 16);

export const priceAlertsRegularEDT = inngest.createFunction(
  {
    id: "price-alerts-regular-edt",
    retries: 1,
    triggers: [{ cron: regularEDT }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay() || !isEDT()) return false;
      return isRegularSessionWindow();
    });
    if (!shouldRun) return { skipped: true };
    return checkPriceAlerts(step);
  }
);

export const priceAlertsRegularEST = inngest.createFunction(
  {
    id: "price-alerts-regular-est",
    retries: 1,
    triggers: [{ cron: regularEST }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay() || isEDT()) return false;
      return isRegularSessionWindow();
    });
    if (!shouldRun) return { skipped: true };
    return checkPriceAlerts(step);
  }
);

// ── Every 2 min (4-9:30AM, 4-8PM) — Extended Hours Price Check ─────

const [extPreEDT, extPreEST] = etIntervalCronPair(2, 4, 9);
const [extPostEDT, extPostEST] = etIntervalCronPair(2, 16, 20);

export const priceAlertsExtPreEDT = inngest.createFunction(
  {
    id: "price-alerts-ext-pre-edt",
    retries: 1,
    triggers: [{ cron: extPreEDT }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay() || !isEDT()) return false;
      return isPremarketWindow();
    });
    if (!shouldRun) return { skipped: true };
    return checkPriceAlerts(step);
  }
);

export const priceAlertsExtPreEST = inngest.createFunction(
  {
    id: "price-alerts-ext-pre-est",
    retries: 1,
    triggers: [{ cron: extPreEST }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay() || isEDT()) return false;
      return isPremarketWindow();
    });
    if (!shouldRun) return { skipped: true };
    return checkPriceAlerts(step);
  }
);

export const priceAlertsExtPostEDT = inngest.createFunction(
  {
    id: "price-alerts-ext-post-edt",
    retries: 1,
    triggers: [{ cron: extPostEDT }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay() || !isEDT()) return false;
      return isAfterHoursWindow();
    });
    if (!shouldRun) return { skipped: true };
    return checkPriceAlerts(step);
  }
);

export const priceAlertsExtPostEST = inngest.createFunction(
  {
    id: "price-alerts-ext-post-est",
    retries: 1,
    triggers: [{ cron: extPostEST }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      if (!isMarketDay() || isEDT()) return false;
      return isAfterHoursWindow();
    });
    if (!shouldRun) return { skipped: true };
    return checkPriceAlerts(step);
  }
);
