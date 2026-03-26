# 11 — Revised Architecture (With Your Existing Stack)

Your existing infrastructure is much better than the generic setup from the original docs. Here's how it all changes.

---

## What You Already Have

| Service           | What It Is                              | How We Use It                        |
| ----------------- | --------------------------------------- | ------------------------------------ |
| **Cloudflare Pro** | DNS, CDN, edge functions                | Domain, Workers for cron triggers    |
| **traderpals.net** | Your domain                             | Dashboard, webhooks, API endpoints   |
| **Vercel Pro**     | Frontend hosting + serverless functions | Dashboard UI, API routes, cron jobs  |
| **Supabase Pro**   | Postgres database + auth + realtime     | Replaces SQLite entirely. Way better.|
| **Inngest**        | Background job / event-driven functions | Replaces APScheduler. Way better.    |

---

## What Changes From the Original Plan

| Original Plan            | New Plan (with your stack)              | Why Better                           |
| ------------------------ | --------------------------------------- | ------------------------------------ |
| SQLite on a VPS          | **Supabase Postgres**                   | Managed, scalable, has realtime subscriptions, row-level security, proper backups |
| APScheduler in Python    | **Inngest**                             | Reliable scheduled + event-driven jobs, retries, observability dashboard, no cron drift |
| Railway $5/mo VPS        | **Vercel serverless functions**         | No server to manage, auto-scales, you already pay for it |
| Simple Python script     | **Next.js API routes + Inngest functions** | Better structure, easier to deploy, dashboard for the group |
| No web interface         | **traderpals.net dashboard**            | Members can see alerts, watchlist, manage settings in a browser |
| Config in YAML files     | **Supabase tables + dashboard UI**      | Group members can add tickers, set alerts from a web UI instead of editing files |

---

## New Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        traderpals.net (Vercel)                       │
│                                                                      │
│  Next.js App                                                         │
│  ├── /dashboard          → Web UI for the group                      │
│  │   ├── Watchlist manager (add/remove tickers)                      │
│  │   ├── Active alerts viewer                                        │
│  │   ├── Today's calendar / earnings                                 │
│  │   └── Bot status / health                                         │
│  │                                                                   │
│  ├── /api/               → API routes (serverless functions)         │
│  │   ├── /api/discord/webhook   → Receives Discord slash commands    │
│  │   ├── /api/webhooks/finnhub  → Receives Finnhub webhook pushes   │
│  │   └── /api/health            → Health check                      │
│  │                                                                   │
│  └── /inngest            → Inngest function handlers                 │
│      ├── market-movers   → Scheduled: fetch + post to #premarket     │
│      ├── news-scan       → Scheduled: poll news + post to #news      │
│      ├── political-scan  → Scheduled: poll RSS + post to #politics   │
│      ├── econ-calendar   → Scheduled: daily calendar + alerts        │
│      ├── earnings        → Scheduled: daily calendar + results       │
│      ├── price-check     → Scheduled: check prices vs alert levels   │
│      ├── flow-scan       → Scheduled: short interest + sentiment     │
│      └── fed-speech      → Event: triggered before Fed speeches      │
│                                                                      │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     ┌──────────────┐ ┌────────┐ ┌──────────────┐
     │   Supabase   │ │Inngest │ │   Discord    │
     │              │ │        │ │              │
     │ • watchlist  │ │ Cron:  │ │ Bot posts to │
     │ • alerts     │ │ • 5min │ │ channels via │
     │ • posted_news│ │ • 30min│ │ webhook URLs │
     │ • earnings   │ │ • daily│ │ or REST API  │
     │ • members    │ │        │ │              │
     └──────────────┘ └────────┘ └──────────────┘
              ▲
              │ Data flows in from:
              │
     ┌────────┴─────────────────────────┐
     │  External APIs                    │
     │  • Finnhub (prices, news, cal)    │
     │  • Polygon (movers, snapshots)    │
     │  • RSS feeds (political news)     │
     │  • Reddit API (sentiment)         │
     └──────────────────────────────────┘
```

---

## How Inngest Replaces APScheduler

Instead of a Python script with `APScheduler` running on a VPS, you define **Inngest functions** that Vercel runs on a schedule. Inngest handles retries, logging, and concurrency.

```typescript
// Example: Market Movers runs every 30 minutes during market hours
inngest.createFunction(
  { id: "market-movers" },
  { cron: "*/30 6-20 * * 1-5" },  // Every 30 min, 6AM-8PM ET, Mon-Fri
  async ({ step }) => {
    // Step 1: Fetch data from Polygon
    const movers = await step.run("fetch-movers", async () => {
      return await fetchTopMovers();
    });

    // Step 2: Post to Discord
    await step.run("post-to-discord", async () => {
      await postToChannel("premarket", buildMoversEmbed(movers));
    });
  }
);
```

### Inngest Schedule for Each Bot

| Function         | Cron                            | Meaning                          |
| ---------------- | ------------------------------- | -------------------------------- |
| `market-movers`  | `*/30 6-20 * * 1-5`            | Every 30 min, 6AM-8PM, Mon-Fri  |
| `premarket-open` | `0 7 * * 1-5`                  | 7:00 AM Mon-Fri                  |
| `market-open`    | `30 9 * * 1-5`                 | 9:30 AM Mon-Fri                  |
| `market-close`   | `0 16 * * 1-5`                 | 4:00 PM Mon-Fri                  |
| `news-scan`      | `*/5 6-20 * * 1-5`             | Every 5 min during market window |
| `political-scan` | `*/10 * * * *`                 | Every 10 min, 24/7               |
| `econ-calendar`  | `30 6 * * 1-5`                 | 6:30 AM Mon-Fri                  |
| `econ-alerts`    | `* 6-16 * * 1-5`               | Every min during market hours (for 15-min-before alerts) |
| `earnings-daily` | `30 6 * * 1-5`                 | 6:30 AM Mon-Fri                  |
| `earnings-results` | `*/2 6-9,16-20 * * 1-5`      | Every 2 min around BMO/AMC windows |
| `price-check`    | `*/1 9-16 * * 1-5`             | Every min during market hours    |
| `flow-scan`      | `*/15 9-16 * * 1-5`            | Every 15 min during market hours |
| `week-ahead`     | `0 20 * * 0`                   | Sunday 8:00 PM                   |

---

## How Supabase Replaces SQLite

Instead of a file on a VPS, you get a real Postgres database with:
- **Dashboard** to view/edit data directly
- **Realtime subscriptions** (the web dashboard can show live updates)
- **Row-level security** (members can only edit their own alerts)
- **Backups** handled for you

### Tables

```sql
-- Watchlist (group-managed via dashboard or slash commands)
create table watchlist (
  ticker text primary key,
  tier text default 'custom',       -- tier1, tier2, futures, custom
  added_by uuid references auth.users,
  added_at timestamptz default now()
);

-- Price alerts (members set these)
create table price_alerts (
  id bigint generated always as identity primary key,
  ticker text not null,
  alert_type text not null,          -- above, below, ma_cross, vwap, pct_move
  level numeric,                     -- price level
  ma_period int,                     -- for MA alerts: 9, 20, 50, 200
  discord_user_id text not null,     -- who set it
  discord_username text,
  active boolean default true,
  triggered_at timestamptz,
  created_at timestamptz default now()
);

-- Posted news (dedup)
create table posted_news (
  news_id text primary key,          -- hash of headline
  ticker text,
  category text,                     -- company, macro, political
  channel text,                      -- news, politics
  posted_at timestamptz default now()
);

-- Posted earnings (dedup)
create table posted_earnings (
  ticker text,
  report_date date,
  result_posted boolean default false,
  posted_at timestamptz default now(),
  primary key (ticker, report_date)
);

-- Economic events today (cached daily)
create table econ_events (
  id bigint generated always as identity primary key,
  event_date date not null,
  event_time time,
  event_name text not null,
  country text default 'US',
  impact text,                       -- high, medium, low
  forecast text,
  previous text,
  actual text,                       -- null until released
  alert_sent boolean default false,
  result_posted boolean default false
);

-- Bot activity log
create table bot_log (
  id bigint generated always as identity primary key,
  bot_name text not null,
  action text not null,
  details jsonb,
  created_at timestamptz default now()
);
```

---

## How Discord Posting Works (Serverless)

Since we're on Vercel (serverless), we can't maintain a persistent Discord bot connection. Instead, we use **Discord webhooks** or the **Discord REST API**:

### Option A: Discord Webhooks (simplest)
- Create a webhook URL for each channel in Discord
- To post a message, just HTTP POST to the webhook URL
- No bot token needed for posting
- Limitation: can't receive slash commands via webhooks

### Option B: Discord REST API + Interactions (full features)
- Use the Discord bot token to POST messages via REST API
- Register slash commands as Discord Interactions
- Slash commands hit your `/api/discord/webhook` endpoint on Vercel
- Discord sends the command → Vercel handles it → responds

### Recommended: Both
- **Webhooks** for all scheduled posts (simpler, faster)
- **REST API + Interactions** for slash commands (`/alert`, `/movers`, etc.)

```typescript
// Posting via webhook (for scheduled messages)
async function postToChannel(channel: string, embed: object) {
  const webhookUrl = process.env[`DISCORD_WEBHOOK_${channel.toUpperCase()}`];
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });
}
```

---

## Language: TypeScript (not Python)

Since you're on **Vercel + Inngest + Supabase**, TypeScript/Next.js is the natural fit:

| Why TypeScript                              | Why Not Python                          |
| ------------------------------------------- | --------------------------------------- |
| Native on Vercel (first-class support)      | Needs a VPS or container to run         |
| Inngest has excellent TS SDK                | Inngest Python SDK exists but TS is primary |
| Supabase has excellent TS SDK (`@supabase/supabase-js`) | Python SDK works but TS is first-class |
| You can build the dashboard in the same repo | Would need a separate frontend project  |
| One language for everything                 | Would need Python + JS/TS for dashboard |

---

## Updated Project Structure

```
traderpals/
├── src/
│   ├── app/                    # Next.js app router
│   │   ├── page.tsx            # Landing / dashboard
│   │   ├── dashboard/          # Member dashboard
│   │   │   ├── watchlist/
│   │   │   ├── alerts/
│   │   │   ├── calendar/
│   │   │   └── earnings/
│   │   └── api/
│   │       ├── discord/
│   │       │   └── interactions/route.ts  # Slash command handler
│   │       └── health/route.ts
│   │
│   ├── inngest/                # Inngest functions (the bots)
│   │   ├── client.ts           # Inngest client setup
│   │   ├── market-movers.ts
│   │   ├── news-scan.ts
│   │   ├── political-scan.ts
│   │   ├── econ-calendar.ts
│   │   ├── earnings.ts
│   │   ├── price-alerts.ts
│   │   ├── flow-scan.ts
│   │   └── fed-speech.ts
│   │
│   ├── lib/                    # Shared utilities
│   │   ├── supabase.ts         # Supabase client
│   │   ├── discord.ts          # Discord webhook + REST helpers
│   │   ├── finnhub.ts          # Finnhub API client
│   │   ├── polygon.ts          # Polygon API client
│   │   ├── rss.ts              # RSS feed parser
│   │   ├── reddit.ts           # Reddit API client
│   │   ├── embeds.ts           # Discord embed builders
│   │   └── market-hours.ts     # Market open/close/holiday logic
│   │
│   └── types/                  # TypeScript types
│       ├── market.ts
│       ├── news.ts
│       └── alerts.ts
│
├── supabase/
│   └── migrations/             # Database migrations
│       └── 001_initial.sql
│
├── config/
│   └── watchlist.ts            # Default watchlist (or manage in Supabase)
│
├── .env.local                  # Local dev secrets
├── .env.example
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## Updated Cost

| Item              | Cost     | Notes                        |
| ----------------- | -------- | ---------------------------- |
| Vercel Pro        | Already paying | Hosts everything       |
| Supabase Pro      | Already paying | Database               |
| Inngest           | Already paying | Job scheduling         |
| Cloudflare Pro    | Already paying | DNS + domain           |
| Polygon free      | $0       | 15-min delayed prices        |
| Finnhub free      | $0       | Real-time IEX + news + calendars |
| Discord bot       | $0       | Free                         |
| **Total new cost**| **$0**   | You already have everything  |

### For real-time prices (upgrade when ready)
| Polygon Starter   | $29/mo   | Real-time consolidated data  |
| Finnhub Premium   | $49/mo   | Full tape + more data        |

---

## Real-Time Price Alerts Without WebSocket

Since Vercel is serverless (no persistent connections), we can't hold a WebSocket open. Two options:

### Option 1: Poll every minute via Inngest (good enough for most alerts)
```
Inngest cron: every 1 minute during market hours
  → Fetch current prices for all tickers with active alerts
  → Compare to alert levels
  → Fire alerts that match
```
1-minute granularity is fine for support/resistance/MA alerts. You won't catch the exact tick, but you'll catch it within 60 seconds.

### Option 2: Use a Cloudflare Worker with WebSocket (real-time)
If you need true real-time alerts, run a lightweight Cloudflare Worker (Durable Object) that holds the Finnhub WebSocket open. When a price crosses an alert level, it calls your Vercel API to post to Discord. This is more complex — build it as a Phase 2 upgrade.

### Recommendation
Start with Option 1 (poll every minute). 99% of the time, catching an alert within 60 seconds is fine. If the group wants faster, add the Cloudflare Worker later.
