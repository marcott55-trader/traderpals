# TraderPals — Project Overview

## What This Is

A system that automatically posts trading data to dedicated Discord channels for a private trading group. Built as a Next.js app on Vercel with Inngest for scheduling and Supabase for persistence. Includes a web dashboard at traderpals.net for the group to manage watchlists and alerts.

**Status:** Design complete, no code written yet. Everything below is the intended architecture.

---

## Channels and Modules

There are **8 Discord channels** served by **7 modules**. Each module has one responsibility. `#bot-logs` is shared by all modules for errors and status updates. Political news is its own module because it runs on a different schedule, uses different sources, and applies stricter market-impact filtering than the main news feed.

| Channel          | Module           | What It Posts                                         |
| ---------------- | ---------------- | ----------------------------------------------------- |
| `#premarket`     | Market Movers    | Futures, top gainers/losers, unusual volume, breakouts |
| `#news`          | News             | Filtered company + macro news for watchlist tickers    |
| `#politics`      | Political News   | White House, tariffs, executive orders, geopolitics    |
| `#econ-calendar` | Econ Calendar    | Daily schedule, pre-event alerts, results, Fed speeches |
| `#earnings`      | Earnings         | Daily calendar, pre-report alerts, beat/miss results   |
| `#alerts`        | Price Alerts     | User-set levels, MA crosses, VWAP, % moves             |
| `#flow`          | Flow / Sentiment | Options volume, short interest, Reddit sentiment       |
| `#bot-logs`      | (all modules)    | Errors and status — admin only                         |

---

## Tech Stack

| Layer          | Service            | Role                                              |
| -------------- | ------------------ | ------------------------------------------------- |
| Hosting        | **Vercel Pro**     | Next.js app, serverless API routes, Inngest handler |
| Scheduling     | **Inngest**        | Cron-triggered and event-driven bot functions       |
| Database       | **Supabase Pro**   | Postgres for watchlists, alerts, dedup, event cache |
| Domain / Edge  | **Cloudflare Pro** | traderpals.net DNS, optional Durable Object for WebSocket (Phase 2) |
| Language       | **TypeScript**     | Entire codebase — fits Vercel/Inngest/Supabase SDKs |
| Market data    | **Finnhub** (free) | Real-time IEX prices, news, earnings cal, econ cal  |
| Market data    | **Polygon** (free) | Snapshots, gainers/losers, ticker details            |
| Market data    | **yfinance**       | Fallback for historical prices, options chains       |
| Political news | **RSS feeds**      | White House, Reuters, AP, Politico                   |
| Sentiment      | **Reddit API**     | r/wallstreetbets, r/stocks mention tracking          |
| Output         | **Discord**        | Webhooks for posting, Interactions API for slash cmds |

---

## Discord Integration Model

Vercel is serverless — there is no persistent process to hold a Discord gateway connection. This means:

- **Posting messages:** Done via Discord webhook URLs (one per channel). An Inngest function fetches data, builds an embed, and POSTs it to the webhook. No bot "presence" needed.
- **Slash commands:** Registered as Discord Interactions. When a user types `/alert above NVDA 150`, Discord sends an HTTP POST to `traderpals.net/api/discord/interactions`. Vercel handles it and responds.
- **Bot appears offline:** The bot won't show as "online" in the member list because there's no gateway connection. Messages still post normally. If online presence matters, a lightweight Cloudflare Worker can hold a gateway heartbeat (Phase 2).

---

## Data Sources — Delay and Reliability

| Data Type          | Source        | Latency        | Notes                                   |
| ------------------ | ------------- | -------------- | --------------------------------------- |
| Stock prices       | Finnhub REST  | Real-time (IEX) | IEX is one exchange (~5-10% of volume). Prices can differ slightly from consolidated tape. |
| Stock prices       | Polygon REST  | **15 min delayed** on free tier | Real-time requires $29/mo Starter plan |
| Price alerts       | Inngest poll  | **Up to 60 sec** | Polls every minute during market hours. Not tick-level. |
| News               | Finnhub       | Real-time      | No delay on news, earnings, or calendar endpoints |
| Earnings calendar  | Finnhub       | Real-time      | Actual results may take minutes to appear after report |
| Economic calendar  | Finnhub       | Real-time      | Results populate within seconds of release |
| Political news     | RSS feeds     | 1-10 min       | Depends on publisher. Polled every 10 min. |
| Reddit sentiment   | Reddit API    | 15-30 min      | Polls hot posts every 15 min |

**What this means for traders:**
- News, earnings, and econ alerts are fast enough for trading decisions
- Price alerts are "within 60 seconds," not instant — set levels with that margin in mind
- Pre-market price data from Finnhub (IEX) may differ from your broker by a few cents
- If the group wants true real-time consolidated prices, upgrade Polygon to $29/mo

---

## All Config and State Lives in Supabase

There are no YAML files, no SQLite, no local config files in production. Everything is in Supabase Postgres:

| What                     | Where                   | Who Manages It              |
| ------------------------ | ----------------------- | --------------------------- |
| API keys                 | Vercel env vars         | You (admin)                 |
| Discord webhook URLs     | Vercel env vars         | You (admin)                 |
| Watchlist tickers        | `watchlist` table       | Group via dashboard or `/watch` |
| Price alert levels       | `price_alerts` table    | Members via `/alert` commands |
| Posted news (dedup)      | `posted_news` table     | Automatic                   |
| Posted earnings (dedup)  | `posted_earnings` table | Automatic                   |
| Economic events (cache)  | `econ_events` table     | Automatic (refreshed daily) |
| Bot activity log         | `bot_log` table         | Automatic                   |

---

## Project Structure

```
traderpals/
├── src/
│   ├── app/                         # Next.js app router
│   │   ├── page.tsx                 # Landing page / dashboard
│   │   ├── dashboard/               # Member-facing web UI
│   │   │   ├── watchlist/
│   │   │   ├── alerts/
│   │   │   ├── calendar/
│   │   │   └── earnings/
│   │   └── api/
│   │       ├── discord/
│   │       │   └── interactions/route.ts   # Slash command handler
│   │       ├── inngest/route.ts            # Inngest webhook endpoint
│   │       └── health/route.ts
│   │
│   ├── inngest/                     # Bot modules (Inngest functions)
│   │   ├── client.ts                # Inngest client init
│   │   ├── market-movers.ts         # → #premarket
│   │   ├── news-scan.ts             # → #news
│   │   ├── political-scan.ts        # → #politics
│   │   ├── econ-calendar.ts         # → #econ-calendar
│   │   ├── earnings.ts              # → #earnings
│   │   ├── price-alerts.ts          # → #alerts
│   │   └── flow-scan.ts             # → #flow
│   │
│   ├── lib/                         # Shared utilities
│   │   ├── supabase.ts              # Supabase client
│   │   ├── discord.ts               # Webhook posting + interaction helpers
│   │   ├── finnhub.ts               # Finnhub API wrapper
│   │   ├── polygon.ts               # Polygon API wrapper
│   │   ├── rss.ts                   # RSS feed parser (political news)
│   │   ├── reddit.ts                # Reddit API client
│   │   ├── embeds.ts                # Discord embed builders
│   │   └── market-hours.ts          # NYSE calendar, timezone helpers
│   │
│   └── types/                       # TypeScript type definitions
│       ├── market.ts
│       ├── news.ts
│       └── alerts.ts
│
├── supabase/
│   └── migrations/
│       └── 001_initial.sql          # All table definitions
│
├── docs/                            # You are here
├── .env.local                       # Local dev secrets (git-ignored)
├── .env.example                     # Template
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## Build Order

1. **Scaffold** — Next.js app, Supabase tables, Inngest client, env vars
2. **Shared lib** — API clients, Discord posting, embed builders, market hours
3. **Market Movers** — Most visible module, validates the whole pipeline end-to-end
4. **Econ Calendar** — Simple, high value, tests scheduling and pre-event alerts
5. **Earnings** — Similar pattern to econ calendar
6. **News + Politics** — Hardest filtering logic, two output channels
7. **Price Alerts** — Slash commands + polling loop
8. **Flow / Sentiment** — Depends on free data quality; build last
9. **Dashboard** — Web UI for the group (can happen in parallel with bots)

---

## Costs

| Item             | Monthly Cost | Status          |
| ---------------- | ------------ | --------------- |
| Vercel Pro       | (existing)   | Already paying  |
| Supabase Pro     | (existing)   | Already paying  |
| Inngest          | (existing)   | Already paying  |
| Cloudflare Pro   | (existing)   | Already paying  |
| Finnhub free     | $0           | —               |
| Polygon free     | $0           | —               |
| Discord bot      | $0           | —               |
| **New cost**     | **$0/mo**    |                 |

Optional upgrades:
- Polygon Starter ($29/mo) for real-time consolidated prices
- Finnhub Premium ($49/mo) for full tape + extended data
- Unusual Whales ($57-97/mo) for premium options flow
