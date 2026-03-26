# Deployment & Development

How to develop locally, deploy to production, and keep things running.

---

## Local Development

### Prerequisites
- Node.js 18+
- A test Discord server (don't spam your real one)
- Supabase project (use a separate dev project or the same one with a `dev_` table prefix)

### Setup

```bash
# Clone and install
git clone <repo-url>
cd traderpals
npm install

# Create .env.local with your dev keys
cp .env.example .env.local
# Edit .env.local with test webhook URLs + API keys

# Run Supabase migrations (if using local Supabase)
npx supabase db push

# Start Inngest dev server (watches for function changes)
npx inngest-cli dev

# Start Next.js dev server
npm run dev

# Open http://localhost:3000 — dashboard
# Open http://localhost:8288 — Inngest dev dashboard (trigger functions manually)
```

### Testing a Bot Function Locally

In the Inngest dev dashboard (localhost:8288):
1. Find the function (e.g., `market-movers`)
2. Click **Trigger** to run it manually
3. Watch the output — it should fetch data and post to your test Discord channel
4. Check your test Discord server for the message

---

## Production Deployment

### Vercel

The app auto-deploys from your GitHub main branch:

1. Connect your GitHub repo to Vercel
2. Set all env vars in Vercel dashboard (Settings → Environment Variables)
3. Push to `main` → Vercel builds and deploys automatically
4. Inngest picks up the deployed functions and starts running crons

### Inngest

After the first deploy:
1. Go to [Inngest dashboard](https://app.inngest.com)
2. Connect your Vercel app (Inngest has a Vercel integration)
3. Verify all functions appear in the dashboard
4. Check that cron schedules are registered

### Supabase

1. Run migrations against your production Supabase project
2. Seed the watchlist table with your default tickers
3. Verify the Vercel env vars point to the production Supabase URL + service role key

---

## Env Vars Checklist

Set all of these in Vercel (Settings → Environment Variables):

```
# Discord (8 webhook URLs + 3 app credentials)
DISCORD_WEBHOOK_PREMARKET
DISCORD_WEBHOOK_NEWS
DISCORD_WEBHOOK_POLITICS
DISCORD_WEBHOOK_ECON_CALENDAR
DISCORD_WEBHOOK_EARNINGS
DISCORD_WEBHOOK_ALERTS
DISCORD_WEBHOOK_FLOW
DISCORD_WEBHOOK_BOT_LOGS
DISCORD_APP_ID
DISCORD_PUBLIC_KEY
DISCORD_BOT_TOKEN

# APIs
FINNHUB_API_KEY
POLYGON_API_KEY
REDDIT_CLIENT_ID
REDDIT_CLIENT_SECRET

# Supabase
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

# Inngest
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
```

---

## Monitoring

### Inngest Dashboard
- See every function run: success, failure, retries
- View execution logs and timing
- Manually trigger functions for testing
- Pause/resume individual functions

### Supabase Dashboard
- Query tables directly to inspect state
- Check `bot_log` table for errors
- Monitor database size and query performance

### Discord `#bot-logs`
- Bot posts errors and anomalies here
- Examples: "Finnhub API returned 429 (rate limited)", "No earnings data available today"

### Health Endpoint
`GET traderpals.net/api/health` returns:
```json
{
  "status": "ok",
  "supabase": "connected",
  "lastRun": {
    "market-movers": "2026-03-25T12:00:00Z",
    "news-scan": "2026-03-25T12:05:00Z"
  }
}
```

---

## Updating

```bash
# Make changes locally
# Test with Inngest dev server
# Push to main
git add -A && git commit -m "update news filters"
git push

# Vercel auto-deploys in ~60 seconds
# Inngest picks up new function definitions immediately
# No restart needed
```

### Updating the Watchlist
- Option A: Edit directly in Supabase dashboard (instant)
- Option B: Use `/watch PLTR` slash command in Discord
- Option C: Update the seed migration and re-run

### Updating Webhook URLs
If a Discord webhook is regenerated:
1. Copy the new URL
2. Update the env var in Vercel dashboard
3. Vercel redeploys automatically

---

## Costs

| Service          | Status          | New Monthly Cost |
| ---------------- | --------------- | ---------------- |
| Vercel Pro       | Already paying  | $0 additional    |
| Supabase Pro     | Already paying  | $0 additional    |
| Inngest          | Already paying  | $0 additional    |
| Cloudflare Pro   | Already paying  | $0 additional    |
| Finnhub          | Free tier       | $0               |
| Polygon          | Free tier       | $0               |
| Discord          | Free            | $0               |
| Reddit API       | Free            | $0               |
| **Total**        |                 | **$0/mo**        |

### Optional Upgrades

| Upgrade                  | Cost    | What You Get                          |
| ------------------------ | ------- | ------------------------------------- |
| Polygon Starter          | $29/mo  | Real-time prices (not 15-min delayed) |
| Finnhub Premium          | $49/mo  | Full consolidated tape, more data     |
| Unusual Whales           | $57-97/mo | Premium options flow, dark pool     |
| Cloudflare Worker (Phase 2) | ~$0  | Bot appears "online", real-time WebSocket alerts |
