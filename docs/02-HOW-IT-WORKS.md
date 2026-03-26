# How It All Works (Plain English)

---

## The Short Version

You have a **Next.js app** hosted on Vercel at traderpals.net. Inside it are **7 bot functions** managed by Inngest. Each function runs on a schedule (like an alarm clock), fetches data from a free API, and posts a formatted message to a Discord channel via webhook. All state (watchlists, alerts, what's already been posted) lives in a Supabase Postgres database.

There is no server running 24/7. There is no Python. There is no bot sitting in Discord "online." Functions wake up, do their job, and go back to sleep.

---

## The Three Layers

```
┌───────────────────────────────────────────────┐
│ LAYER 1: SCHEDULING (Inngest)                 │
│                                               │
│ "What runs and when"                          │
│                                               │
│ Inngest fires your functions on cron          │
│ schedules. Every 5 min, every 30 min,         │
│ 6:30 AM daily, etc.                           │
│                                               │
│ If a function fails, Inngest retries it.      │
│ You can see all runs in the Inngest dashboard.│
└──────────────────┬────────────────────────────┘
                   │ triggers
                   ▼
┌───────────────────────────────────────────────┐
│ LAYER 2: LOGIC (Vercel serverless functions)  │
│                                               │
│ "What happens when a function runs"           │
│                                               │
│ Each function:                                │
│ 1. Reads config from Supabase (watchlist)     │
│ 2. Calls an external API (Finnhub, Polygon)   │
│ 3. Processes the data (filter, score, rank)   │
│ 4. Checks Supabase for dedup (already posted?)│
│ 5. Builds a Discord embed                     │
│ 6. POSTs it to a Discord webhook URL          │
│ 7. Saves state to Supabase (mark as posted)   │
└──────────────────┬────────────────────────────┘
                   │ reads/writes
                   ▼
┌───────────────────────────────────────────────┐
│ LAYER 3: STATE (Supabase Postgres)            │
│                                               │
│ "What the system remembers"                   │
│                                               │
│ • Watchlist tickers                           │
│ • Price alert levels                          │
│ • Which news was already posted               │
│ • Which earnings were already reported        │
│ • Today's economic events                     │
│ • Activity log                                │
└───────────────────────────────────────────────┘
```

---

## How Each Module Gets Triggered

Every module is an **Inngest function** with a cron schedule. Inngest calls your Vercel app at the scheduled time. The function runs, does its work, and exits. No persistent process.

### Market Movers → `#premarket`

```
7:00 AM ET (weekdays)  →  Pre-market snapshot
   Inngest fires market-movers function
   → Calls Polygon: "top gainers and losers"
   → Calls Finnhub: "current futures prices"
   → Filters: skip stocks under $5, under 500K volume
   → Builds embed with formatted data
   → POSTs to #premarket Discord webhook
   → Done. Function exits.

9:30 AM ET  →  Market open snapshot
Every 30 min (9:30 AM - 4:00 PM)  →  Intraday scan
4:00 PM ET  →  Close summary
4:15 PM ET  →  After-hours movers
```

### News → `#news`

```
Every 5 min (6 AM - 8 PM, weekdays)  →  Company news scan
   → Reads watchlist from Supabase
   → Calls Finnhub: "new news for each ticker since last check"
   → Scores each headline (source quality + keywords + watchlist)
   → Checks posted_news table: "already posted this?"
   → If score >= 30 and not posted → build embed → POST to #news webhook
   → Save to posted_news table
```

### Politics → `#politics`

```
Every 10 min (24/7)  →  Political news scan
   → Fetches RSS feeds (White House, Reuters, AP, Politico)
   → Filters by market-relevant keywords (tariffs, sanctions, etc.)
   → Rejects noise (campaign rallies, polls, fundraising)
   → Checks posted_news table for dedup
   → If market-relevant → build embed → POST to #politics webhook
```

### Econ Calendar → `#econ-calendar`

```
6:30 AM ET (weekdays)  →  Daily calendar
   → Calls Finnhub: "today's economic events"
   → Groups by impact (high / medium / low)
   → Includes Fed speeches with speaker name + voting status
   → POSTs full calendar to #econ-calendar

Every 1 min (6 AM - 4 PM)  →  Pre-event alerts
   → Reads today's events from Supabase econ_events table
   → If any high-impact event is 15 min away AND alert not yet sent:
     → POST "⏰ CPI releases in 15 minutes" to #econ-calendar
     → Mark alert_sent = true

Every 1 min (during event windows)  →  Result drops
   → For events where actual is still NULL:
     → Call Finnhub: "has the actual value been published?"
     → If yes: POST result with actual vs forecast, mark result_posted = true
```

### Earnings → `#earnings`

```
6:30 AM ET (weekdays)  →  Daily earnings calendar
   → Calls Finnhub: "who reports today?"
   → Cross-references with watchlist (⭐ starred tickers)
   → Groups by BMO (before open) and AMC (after close)
   → POSTs to #earnings

3:45 PM ET  →  Pre-report alert for AMC watchlist tickers
6:15 AM ET  →  Pre-report alert for BMO watchlist tickers

Every 2 min (6-9 AM, 4-8 PM)  →  Result tracking
   → Polls Finnhub for actual EPS/revenue
   → When results appear → POST beat/miss embed
```

### Price Alerts → `#alerts`

```
Every 1 min (market hours)  →  Price check
   → Reads all active alerts from Supabase price_alerts table
   → Fetches current prices from Finnhub for those tickers
   → For each alert:
     → "Is NVDA now above $150?" → yes → fire alert
     → POST to #alerts
     → Mark triggered_at in Supabase, set active = false

Slash commands (anytime):
   User types /alert above NVDA 150 in Discord
   → Discord sends HTTP POST to traderpals.net/api/discord/interactions
   → Vercel handles it: validate ticker, save to Supabase, respond "✅ Alert set"
```

### Flow / Sentiment → `#flow`

```
Every 15 min (market hours)  →  Options volume scan
   → Check options volume vs open interest for watchlist tickers
   → Flag unusual activity (volume > 3x open interest)

Every 30 min  →  Reddit sentiment
   → Poll r/wallstreetbets, r/stocks hot posts
   → Count ticker mentions, compare to 7-day average
   → If spike detected → POST to #flow

6:00 PM ET (weekdays)  →  Short interest summary
   → Fetch short interest data from Finnhub for watchlist
   → Flag high SI tickers (> 20% of float)
```

---

## How Discord Posting Works

There is no bot "logged in" to Discord. Instead:

1. You create a **webhook URL** for each channel in Discord (right-click channel → Integrations → Webhooks → New Webhook → Copy URL)
2. Store each URL in Vercel env vars: `DISCORD_WEBHOOK_PREMARKET`, `DISCORD_WEBHOOK_NEWS`, etc.
3. To post a message, the function does an HTTP POST to that URL with the embed payload

```
Your Inngest function                Discord
       │                                │
       │  POST https://discord.com/     │
       │  api/webhooks/123456/abcdef    │
       │  { embeds: [{title: "...",     │
       │    fields: [...]}] }           │
       │ ─────────────────────────────► │
       │                                │
       │         200 OK                 │
       │ ◄───────────────────────────── │
       │                                │
       │                    Message appears in channel
```

For **slash commands** (`/alert`, `/movers`), Discord Interactions API sends commands to your Vercel endpoint as HTTP POSTs. You register the commands once with Discord, point them to `traderpals.net/api/discord/interactions`, and handle them there.

---

## How Slash Commands Work

```
User types: /alert above NVDA 150
       │
       ▼
Discord sends HTTP POST to:
  traderpals.net/api/discord/interactions
       │
       ▼
Vercel function receives it:
  1. Verify Discord signature (security)
  2. Parse: ticker=NVDA, type=above, level=150
  3. Validate: Is NVDA a real ticker? Is 150 reasonable?
  4. Insert into Supabase price_alerts table
  5. Respond to Discord: "✅ Alert set: NVDA > $150.00"
       │
       ▼
Discord shows the response to the user

Next price-check cycle (within 60 seconds):
  → Inngest function reads the new alert from Supabase
  → Starts checking NVDA price against $150 each cycle
```

---

## What a Normal Trading Day Looks Like

```
 6:00 AM   Inngest fires: refresh historical prices for MA calculations
 6:15 AM   Inngest fires: pre-report alert for BMO watchlist earnings
 6:30 AM   Inngest fires: daily econ calendar → #econ-calendar
           Inngest fires: daily earnings calendar → #earnings
 7:00 AM   Inngest fires: pre-market movers → #premarket
 8:15 AM   Inngest fires: econ-alerts detects CPI in 15 min → #econ-calendar
 8:30 AM   Inngest fires: econ-alerts detects CPI result → #econ-calendar
 9:00 AM   News scan starts running every 5 min
 9:30 AM   Inngest fires: market open snapshot → #premarket
 9:31 AM   Price alert check starts running every 1 min
10:00 AM   Inngest fires: intraday volume scan → unusual PLTR volume → #premarket
10:05 AM   News scan picks up Reuters article about PLTR → #news
10:10 AM   Political scan picks up tariff announcement → #politics
10:31 AM   Price check: NVDA crosses $150 → fires alert → #alerts
12:45 PM   Econ-alerts: "Powell speaks in 15 min" → #econ-calendar
 1:15 PM   News scan: "Powell says 'confident inflation cooling'" → #news
 3:45 PM   Inngest fires: pre-report alert for AMC watchlist earnings
 4:00 PM   Inngest fires: market close summary → #premarket
 4:05 PM   Earnings result scan: LULU beats → #earnings
 4:15 PM   Inngest fires: after-hours movers → #premarket
 6:00 PM   Inngest fires: short interest summary → #flow
 8:00 PM   Scans reduce to low frequency. Most functions stop until tomorrow.
```

---

## What If Something Breaks

| Problem                    | What Happens                                              |
| -------------------------- | --------------------------------------------------------- |
| Inngest function fails     | Inngest retries automatically (up to 3x with backoff)     |
| Finnhub API is down        | Function logs error, tries fallback (Polygon or yfinance) |
| Polygon API is down        | Function logs error, skips this cycle, retries next       |
| Discord webhook fails      | Function retries. If persistent, logs to Supabase bot_log |
| Supabase is down           | Functions fail. Inngest retries when it's back.           |
| Wrong data posted          | Delete the Discord message manually. Fix the filter logic.|
| You want to change watchlist | Edit it in Supabase dashboard or via /watch command      |

---

## Development → Production Flow

```
YOUR MAC                              PRODUCTION
┌──────────────────────┐             ┌──────────────────────┐
│                      │             │                      │
│  VS Code             │  git push   │  Vercel auto-deploys │
│  Edit code           │ ──────────► │  from main branch    │
│  Test locally with   │             │                      │
│  Inngest dev server  │             │  Inngest runs funcs  │
│  + test Discord      │             │  on schedule         │
│  server              │             │                      │
│                      │             │  Supabase stores     │
│  .env.local has      │             │  all state           │
│  test API keys +     │             │                      │
│  test webhook URLs   │             │  Discord channels    │
│                      │             │  get messages        │
└──────────────────────┘             └──────────────────────┘
```

1. Write code on your Mac
2. Test with `npx inngest-cli dev` + a test Discord server
3. Push to GitHub → Vercel auto-deploys
4. Inngest picks up the new functions immediately
