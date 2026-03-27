import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { postEmbed } from "@/lib/discord";
import { buildEarningsResultEmbed } from "@/lib/earnings-embeds";
import {
  buildPreEventAlertEmbed,
  buildResultDropEmbed,
} from "@/lib/econ-embeds";
import { buildNewsEmbed, buildPoliticalNewsEmbed } from "@/lib/news-embeds";
import { generateNewsId } from "@/lib/news-scoring";
import {
  buildClusterId,
  isStoryAlreadyPosted,
  markStoryPosted,
} from "@/lib/story-clustering";
import { supabase } from "@/lib/supabase";
import type { EarningsResult, EconEventRow } from "@/types/alerts";
import type { ScoredArticle, NewsTag } from "@/types/news";

type WebhookTopic = "news" | "politics" | "econ" | "earnings";

type JsonRecord = Record<string, unknown>;

export interface NormalizedWebhookPayload {
  topic: WebhookTopic;
  externalId?: string;
  headline?: string;
  summary?: string;
  source?: string;
  url?: string;
  tickers?: string[];
  score?: number;
  tag?: NewsTag;
  category?: "company" | "macro" | "political";
  eventName?: string;
  eventDate?: string;
  eventTime?: string | null;
  impact?: string | null;
  forecast?: string | null;
  previous?: string | null;
  actual?: string | null;
  isFedSpeech?: boolean;
  speakerName?: string | null;
  isVotingMember?: boolean | null;
  reminder?: boolean;
  ticker?: string;
  reportDate?: string;
  epsActual?: number | null;
  epsEstimate?: number | null;
  revenueActual?: number | null;
  revenueEstimate?: number | null;
  hour?: string;
  isBeat?: boolean | null;
}

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function getWebhookSecretFromRequest(request: NextRequest): string | null {
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) return bearer.slice(7).trim();

  const headerSecret = request.headers.get("x-webhook-secret");
  if (headerSecret) return headerSecret;

  const url = new URL(request.url);
  return url.searchParams.get("secret");
}

export function verifyWebhookRequest(request: NextRequest): boolean {
  const expected = process.env.WEBHOOK_SHARED_SECRET;
  if (!expected) return false;
  return getWebhookSecretFromRequest(request) === expected;
}

function pickHeaders(request: NextRequest): JsonRecord {
  const keys = ["content-type", "user-agent", "x-forwarded-for", "x-webhook-secret"];
  const out: JsonRecord = {};
  for (const key of keys) {
    const value = request.headers.get(key);
    if (value) out[key] = value;
  }
  return out;
}

function isNormalizedPayload(value: unknown): value is NormalizedWebhookPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      "topic" in value &&
      typeof (value as { topic?: unknown }).topic === "string"
  );
}

async function upsertWebhookDelivery(
  provider: string,
  topic: string | null,
  eventId: string,
  payload: unknown,
  headers: JsonRecord
): Promise<void> {
  await supabase.from("webhook_deliveries").upsert({
    provider,
    topic,
    event_id: eventId,
    payload,
    headers,
  }, {
    onConflict: "provider,event_id",
  });
}

async function markWebhookDelivery(
  provider: string,
  eventId: string,
  status: "processed" | "stored" | "duplicate" | "error",
  error?: string
) {
  await supabase
    .from("webhook_deliveries")
    .update({
      status,
      error: error ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("provider", provider)
    .eq("event_id", eventId);
}

async function isNewsAlreadyPosted(newsId: string): Promise<boolean> {
  const { data } = await supabase
    .from("posted_news")
    .select("news_id")
    .eq("news_id", newsId)
    .limit(1);
  return (data ?? []).length > 0;
}

async function handleNewsPayload(
  topic: "news" | "politics",
  provider: string,
  payload: NormalizedWebhookPayload
) {
  const headline = payload.headline?.trim();
  if (!headline) return { status: "stored" as const, reason: "missing headline" };

  const newsId = payload.externalId ?? generateNewsId(headline, payload.source ?? provider);
  if (await isNewsAlreadyPosted(newsId)) {
    return { status: "duplicate" as const, reason: "exact duplicate" };
  }

  const clusterId = buildClusterId(headline);
  if (await isStoryAlreadyPosted(clusterId, topic)) {
    return { status: "duplicate" as const, reason: "cluster duplicate" };
  }

  if (topic === "politics") {
    await postEmbed("politics", buildPoliticalNewsEmbed(
      headline,
      payload.summary ?? "",
      payload.source ?? provider,
      payload.url ?? ""
    ));
    await supabase.from("posted_news").insert({
      news_id: newsId,
      ticker: null,
      category: "political",
      channel: "politics",
      headline,
    });
  } else {
    const article: ScoredArticle = {
      headline,
      summary: payload.summary ?? "",
      source: payload.source ?? provider,
      url: payload.url ?? "",
      datetime: Math.floor(Date.now() / 1000),
      tickers: payload.tickers ?? [],
      score: payload.score ?? 70,
      category: payload.category ?? ((payload.tickers?.length ?? 0) > 0 ? "company" : "macro"),
      tag: payload.tag ?? "general",
      newsId,
    };

    await postEmbed("news", buildNewsEmbed(article));
    await supabase.from("posted_news").insert({
      news_id: newsId,
      ticker: payload.tickers?.[0] ?? null,
      category: article.category,
      channel: "news",
      headline,
    });
  }

  await markStoryPosted(clusterId, topic, headline);
  return { status: "processed" as const };
}

async function findExistingEconEvent(payload: NormalizedWebhookPayload) {
  const { data } = await supabase
    .from("econ_events")
    .select("*")
    .eq("event_date", payload.eventDate)
    .eq("event_name", payload.eventName)
    .eq("event_time", payload.eventTime ?? null)
    .limit(1);
  return (data?.[0] ?? null) as EconEventRow | null;
}

async function handleEconPayload(
  payload: NormalizedWebhookPayload
) {
  if (!payload.eventName || !payload.eventDate) {
    return { status: "stored" as const, reason: "missing econ identifiers" };
  }

  const existing = await findExistingEconEvent(payload);
  const row = {
    event_date: payload.eventDate,
    event_time: payload.eventTime ?? null,
    event_name: payload.eventName,
    country: "US",
    impact: payload.impact ?? "medium",
    forecast: payload.forecast ?? null,
    previous: payload.previous ?? null,
    actual: payload.actual ?? null,
    is_fed_speech: payload.isFedSpeech ?? false,
    speaker_name: payload.speakerName ?? null,
    is_voting_member: payload.isVotingMember ?? null,
    alert_sent: existing?.alert_sent ?? false,
    result_posted: existing?.result_posted ?? false,
  };

  let eventRow: EconEventRow;
  if (existing) {
    await supabase.from("econ_events").update(row).eq("id", existing.id);
    eventRow = { ...existing, ...row };
  } else {
    const { data } = await supabase.from("econ_events").insert(row).select("*").limit(1);
    eventRow = (data?.[0] ?? { id: 0, created_at: new Date().toISOString(), ...row }) as EconEventRow;
  }

  if (payload.reminder && !eventRow.alert_sent) {
    await postEmbed("econ-calendar", buildPreEventAlertEmbed(eventRow));
    await supabase.from("econ_events").update({ alert_sent: true }).eq("id", eventRow.id);
    return { status: "processed" as const };
  }

  if (payload.actual && !eventRow.result_posted) {
    await postEmbed("econ-calendar", buildResultDropEmbed(eventRow));
    await supabase.from("econ_events").update({ result_posted: true }).eq("id", eventRow.id);
    return { status: "processed" as const };
  }

  return { status: "stored" as const };
}

async function handleEarningsPayload(payload: NormalizedWebhookPayload) {
  const ticker = payload.ticker?.trim().toUpperCase();
  const reportDate = payload.reportDate;
  if (!ticker || !reportDate) {
    return { status: "stored" as const, reason: "missing earnings identifiers" };
  }

  await supabase.from("posted_earnings").upsert({
    ticker,
    report_date: reportDate,
    result_posted: Boolean(payload.epsActual != null || payload.revenueActual != null),
  }, {
    onConflict: "ticker,report_date",
  });

  if (payload.epsActual == null && payload.revenueActual == null) {
    return { status: "stored" as const };
  }

  const { data: watchlistRows } = await supabase
    .from("watchlist")
    .select("ticker")
    .eq("ticker", ticker)
    .limit(1);

  const result: EarningsResult = {
    ticker,
    epsActual: payload.epsActual ?? null,
    epsEstimate: payload.epsEstimate ?? null,
    revenueActual: payload.revenueActual ?? null,
    revenueEstimate: payload.revenueEstimate ?? null,
    hour: payload.hour ?? "dmh",
    reportDate,
    isBeat: payload.isBeat ?? (
      payload.epsActual != null && payload.epsEstimate != null
        ? payload.epsActual >= payload.epsEstimate
        : null
    ),
    isWatchlist: (watchlistRows ?? []).length > 0,
  };

  await postEmbed("earnings", buildEarningsResultEmbed(result));
  await supabase
    .from("posted_earnings")
    .update({ result_posted: true })
    .eq("ticker", ticker)
    .eq("report_date", reportDate);

  return { status: "processed" as const };
}

async function processNormalizedPayload(
  provider: string,
  payload: NormalizedWebhookPayload
) {
  switch (payload.topic) {
    case "news":
      return handleNewsPayload("news", provider, payload);
    case "politics":
      return handleNewsPayload("politics", provider, payload);
    case "econ":
      return handleEconPayload(payload);
    case "earnings":
      return handleEarningsPayload(payload);
    default:
      return { status: "stored" as const, reason: "unsupported topic" };
  }
}

export async function ingestWebhookRequest(
  request: NextRequest,
  provider: string,
  payload: unknown
) {
  const headers = pickHeaders(request);
  const eventId =
    (payload as { externalId?: string; id?: string; eventId?: string } | null)?.externalId ??
    (payload as { id?: string } | null)?.id ??
    (payload as { eventId?: string } | null)?.eventId ??
    hashPayload(payload);
  const topic =
    isNormalizedPayload(payload) ? payload.topic : (payload as { topic?: string } | null)?.topic ?? null;

  await upsertWebhookDelivery(provider, topic, eventId, payload, headers);

  try {
    if (!isNormalizedPayload(payload)) {
      await markWebhookDelivery(provider, eventId, "stored");
      return {
        ok: true,
        stored: true,
        processed: false,
        eventId,
      };
    }

    const result = await processNormalizedPayload(provider, payload);
    await markWebhookDelivery(provider, eventId, result.status);
    return {
      ok: true,
      stored: true,
      processed: result.status === "processed",
      duplicate: result.status === "duplicate",
      eventId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown webhook error";
    await markWebhookDelivery(provider, eventId, "error", message);
    throw error;
  }
}
