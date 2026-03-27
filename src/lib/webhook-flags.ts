const ENABLED = new Set(["1", "true", "yes", "on"]);

export type WebhookDomain = "news" | "politics" | "econ" | "earnings";

export function isWebhookEnabledFor(domain: WebhookDomain): boolean {
  const key = `USE_WEBHOOK_${domain.toUpperCase()}`;
  const value = process.env[key]?.toLowerCase();
  return value != null && ENABLED.has(value);
}

export function hasWebhookSecret(): boolean {
  return Boolean(process.env.WEBHOOK_SHARED_SECRET);
}
