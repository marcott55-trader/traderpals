# Webhook Vendor Setup

This app now supports receiving webhook deliveries at:

`POST /api/webhooks/[provider]`

Examples:

- `/api/webhooks/fxstreet`
- `/api/webhooks/benzinga`

## What works right now

The webhook system can already:

- authenticate inbound webhook requests with a shared secret
- store every delivery in `webhook_deliveries`
- dedupe deliveries by `(provider, event_id)`
- immediately process normalized payloads for:
  - `news`
  - `politics`
  - `econ`
  - `earnings`

## Important limitation

Raw vendor payloads are currently stored safely, but not every provider payload is automatically transformed yet.

That matters because:

- FXStreet webhook notifications may send IDs or change sets, not always full post/event objects
- Benzinga webhook notifications include provider-specific payload shapes and headers

So the migration path is:

1. connect vendor webhook
2. capture a real delivery in `webhook_deliveries`
3. map that vendor payload into the normalized format
4. only then flip the matching `USE_WEBHOOK_*` flag to disable polling

## Step 1: Run the migration - DONE

Apply:

- `supabase/migrations/003_webhook_deliveries.sql`

This adds the inbox table:

- `webhook_deliveries`

## Step 2: Add env vars

Add these to your environment:

```env
WEBHOOK_SHARED_SECRET=choose-a-long-random-secret

# Leave these false until you confirm real webhook deliveries are processing correctly
USE_WEBHOOK_NEWS=false
USE_WEBHOOK_POLITICS=false
USE_WEBHOOK_ECON=false
USE_WEBHOOK_EARNINGS=false
```

## Step 3: Deploy and expose your endpoint

Your webhook URL must be public HTTPS.

Production example:

```text
https://your-domain.com/api/webhooks/fxstreet?secret=YOUR_SECRET
https://your-domain.com/api/webhooks/benzinga?secret=YOUR_SECRET
```

Local testing example:

Use `ngrok` or another tunnel, then register:

```text
https://your-ngrok-subdomain.ngrok.app/api/webhooks/fxstreet?secret=YOUR_SECRET
```

## Step 4: Smoke test with a normalized payload

You can test the whole pipeline immediately without waiting on a vendor.

### News test

```bash
curl -X POST http://localhost:3000/api/webhooks/fxstreet?secret=YOUR_SECRET \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "news",
    "externalId": "test-news-1",
    "headline": "NVDA receives new bullish analyst note",
    "summary": "Test webhook payload for company news.",
    "source": "fxstreet-test",
    "url": "https://example.com/news/nvda",
    "tickers": ["NVDA"],
    "score": 75,
    "tag": "upgrade",
    "category": "company"
  }'
```

### Politics test

```bash
curl -X POST http://localhost:3000/api/webhooks/fxstreet?secret=YOUR_SECRET \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "politics",
    "externalId": "test-politics-1",
    "headline": "Treasury announces new sanctions package",
    "summary": "Test webhook payload for political news.",
    "source": "fxstreet-test",
    "url": "https://example.com/politics/sanctions"
  }'
```

### Econ reminder test

```bash
curl -X POST http://localhost:3000/api/webhooks/fxstreet?secret=YOUR_SECRET \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "econ",
    "externalId": "test-econ-1",
    "eventName": "FOMC Member Daly Speaks",
    "eventDate": "2026-03-27",
    "eventTime": "11:30:00",
    "impact": "high",
    "isFedSpeech": true,
    "speakerName": "Mary Daly",
    "isVotingMember": true,
    "reminder": true
  }'
```

### Earnings result test

```bash
curl -X POST http://localhost:3000/api/webhooks/benzinga?secret=YOUR_SECRET \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "earnings",
    "externalId": "test-earnings-1",
    "ticker": "AAPL",
    "reportDate": "2026-03-27",
    "hour": "amc",
    "epsActual": 2.11,
    "epsEstimate": 2.01,
    "revenueActual": 101200000000,
    "revenueEstimate": 99800000000
  }'
```

Expected result:

- Discord post appears in the matching channel
- row appears in `webhook_deliveries`
- response is JSON like:

```json
{
  "ok": true,
  "stored": true,
  "processed": true,
  "eventId": "..."
}
```

## Step 5: Connect FXStreet

Official docs:

- Webhooks overview: `https://docs.fxstreet.com/api/webhooks`
- Calendar webhooks: `https://docs.fxstreet.com/api/calendar/webhooks/`
- News webhooks: `https://docs.fxstreet.com/api/news/webhooks/`

Use FXStreet for:

- `econ`
- `news`
- possibly `politics` if you want to filter their news feed for political content

Recommended registration:

- FXStreet news webhook target:
  - `/api/webhooks/fxstreet?secret=YOUR_SECRET`
- FXStreet calendar webhook target:
  - `/api/webhooks/fxstreet?secret=YOUR_SECRET`

Subscribe to:

- News:
  - `post_created`
  - `post_updated`
- Calendar:
  - `event_created`
  - `eventDate_created`
  - `eventDate_updated`

Important:

- FXStreet docs note that some notifications only send IDs or change sets
- That means you will likely also need their API access to fetch the full post/event after the webhook arrives

Do not set these to `true` yet unless you’ve confirmed your handler is processing real FXStreet payloads correctly:

- `USE_WEBHOOK_NEWS`
- `USE_WEBHOOK_POLITICS`
- `USE_WEBHOOK_ECON`

## Step 6: Connect Benzinga

Official docs:

- Webhook overview: `https://docs.benzinga.com/webhook-reference/overview`
- Data webhook engine: `https://benzinga-2.mintlify.app/webhook-reference/webhook-engine`

Use Benzinga for:

- `earnings`

Recommended target:

- `/api/webhooks/benzinga?secret=YOUR_SECRET`

Ask Benzinga to send:

- earnings calendar updates
- earnings result updates

Important:

- Benzinga includes a unique `X-BZ-Delivery` header and payload IDs for dedupe
- This app already stores the raw headers and payload in `webhook_deliveries`

Do not set `USE_WEBHOOK_EARNINGS=true` until at least one real Benzinga delivery has been validated end-to-end.

## Step 7: Inspect stored deliveries

Before disabling polling, inspect:

- `webhook_deliveries.provider`
- `webhook_deliveries.topic`
- `webhook_deliveries.payload`
- `webhook_deliveries.status`
- `webhook_deliveries.error`

What you want to see:

- deliveries arriving successfully
- `status = processed` for the domain you are migrating
- correct Discord posts appearing

## Step 8: Flip one domain at a time

Only after validation, enable one flag at a time:

```env
USE_WEBHOOK_ECON=true
USE_WEBHOOK_NEWS=true
USE_WEBHOOK_POLITICS=true
USE_WEBHOOK_EARNINGS=true
```

Recommended order:

1. `econ`
2. `news`
3. `politics`
4. `earnings`

## Recommended cutover order

### First cut: Econ

Why:

- best fit for FXStreet calendar webhooks
- easy operational win
- directly reduces polling

### Second cut: News

Why:

- most event-driven
- webhook model is much cleaner than scan loops

### Third cut: Politics

Why:

- reuse the news webhook source
- keep your own political filtering after receipt

### Fourth cut: Earnings

Why:

- better when Benzinga is actually provisioned
- useful, but vendor-dependent

## Current code paths involved

- ingress route:
  - `src/app/api/webhooks/[provider]/route.ts`
- processing:
  - `src/lib/webhook-ingest.ts`
- feature flags:
  - `src/lib/webhook-flags.ts`
- conditional scheduler registration:
  - `src/app/api/inngest/route.ts`

## What still needs to be done for full vendor cutover

Per vendor:

1. receive a real payload
2. map raw payload fields into the normalized app format
3. if the webhook only sends IDs, fetch the full object from the vendor API
4. verify Discord output
5. then disable the polling bot for that domain
