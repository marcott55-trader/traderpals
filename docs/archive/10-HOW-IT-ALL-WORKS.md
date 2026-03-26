# 10 — How It All Works (Plain English)

This doc explains the entire system in simple terms — how the pieces connect, where things live, and what triggers what.

---

## The Big Picture

Think of this like a **newsroom with robot reporters**.

- You have **one program** running 24/5 on a server (a cheap cloud computer)
- That program has **7 "reporters"** (called cogs/modules) inside it
- Each reporter has **one job**: watch a data source, and when something interesting happens, post it to a specific Discord channel
- The reporters share tools (API connections, formatting helpers, a small database)

```
                    ┌──────────────────────────────┐
                    │     YOUR SERVER (Railway)      │
                    │                                │
                    │   ┌────────────────────────┐   │
                    │   │      main.py           │   │
                    │   │   (the brain)          │   │
                    │   │                        │   │
                    │   │  Starts everything,    │   │
                    │   │  loads all reporters,  │   │
                    │   │  connects to Discord   │   │
                    │   └──────────┬─────────────┘   │
                    │              │                  │
                    │   ┌──────────▼─────────────┐   │
                    │   │   Discord Connection    │   │
                    │   │   (one bot account)     │   │
                    │   └──────────┬─────────────┘   │
                    │              │                  │
                    │   Reporters (cogs):             │
                    │   ├── Market Movers  → #premarket│
                    │   ├── News           → #news     │
                    │   ├── Politics        → #politics │
                    │   ├── Econ Calendar  → #econ-cal │
                    │   ├── Earnings       → #earnings │
                    │   ├── Price Alerts   → #alerts   │
                    │   └── Flow/Sentiment → #flow     │
                    │                                │
                    └──────────────────────────────┘
                         │            │
                         ▼            ▼
               ┌──────────────┐  ┌──────────────┐
               │  Finnhub API │  │  Polygon API │
               │  (free data) │  │  (free data) │
               └──────────────┘  └──────────────┘
```

---

## Where Does Everything Live?

### Your Code (the bots)
Lives in a **Git repository** (like a folder synced to GitHub). You write and edit code on your Mac. When ready, you push it to the server.

### The Server
A small cloud computer that runs your code 24/5. Think of it like a Mac Mini that someone else hosts for you. It costs ~$5/month (Railway, DigitalOcean, etc). It:
- Runs your Python program non-stop
- Has internet access to call APIs and talk to Discord
- Restarts automatically if it crashes

### The Database (SQLite)
A single small file (`traderpals.db`) on the server that stores:
- Which news articles were already posted (so it doesn't repeat)
- Price alert levels your group members set
- Which earnings were already reported
- Think of it like a simple spreadsheet the bot uses as its memory

### The APIs (data sources)
External services your bot calls over the internet to get data:
- **Finnhub** = free stock data, news, earnings calendar, economic calendar
- **Polygon** = free stock snapshots, gainers/losers
- **RSS feeds** = free news feeds from White House, Reuters, etc.
- **Reddit API** = free social sentiment data

### Discord
Your bot logs into Discord like a user would, but it's automated. Discord gives you a **bot token** (like a password) that lets your program send messages to your server's channels.

---

## How Does Each Bot Get Triggered?

There are **3 types of triggers**:

### 1. Scheduled (like an alarm clock)

Most bots run on a schedule. The program has a built-in scheduler (APScheduler) that works like cron jobs or alarms:

```
"Every weekday at 6:30 AM ET → run the earnings calendar task"
"Every weekday at 7:00 AM ET → run the pre-market movers task"
"Every 5 minutes during market hours → check for new news"
"Every Sunday at 8:00 PM ET → post the week-ahead preview"
```

**What happens when a scheduled task fires:**

Step by step, using Market Movers at 7:00 AM as an example:

```
1. Clock hits 7:00 AM ET
   └── Scheduler says: "time to run pre-market movers"

2. Market Movers reporter wakes up
   └── Calls Polygon API: "give me today's top gainers and losers"

3. Polygon API responds with raw data
   └── JSON blob: [{ticker: "NVDA", change: 8.2, volume: 45000000}, ...]

4. Reporter processes the data
   └── Filters: skip stocks under $5, under 500K volume
   └── Sorts: biggest movers first
   └── Checks watchlist: star NVDA because it's on our list

5. Reporter builds a Discord message
   └── Formats it into a nice embed with colors, fields, etc.

6. Reporter sends it to #premarket
   └── Uses the Discord connection to post the embed

7. Done. Reporter goes back to sleep until next trigger.
```

### 2. Real-Time (WebSocket — always listening)

The **Price Alerts bot** uses a WebSocket connection. This is like a phone call that stays open:

```
1. Bot connects to Finnhub WebSocket (a live data stream)
   └── "Hey Finnhub, send me every trade for NVDA, TSLA, AAPL..."

2. Finnhub sends a message every time those stocks trade
   └── {ticker: "NVDA", price: 150.25, timestamp: ...}
   └── {ticker: "NVDA", price: 150.30, timestamp: ...}
   └── {ticker: "TSLA", price: 198.10, timestamp: ...}
   └── (hundreds per second during market hours)

3. For each trade, the bot checks:
   └── "Does anyone have an alert for NVDA above $150?"
   └── "Yes! Carlos set one."

4. ALERT FIRED
   └── Bot posts to #alerts: "🔔 NVDA just broke above $150!"
   └── Marks the alert as triggered so it doesn't fire again
```

### 3. Polling (check periodically)

The **News bot** and **Earnings bot** poll — they ask "anything new?" on a regular interval:

```
Every 5 minutes:
  1. News bot asks Finnhub: "any new news for NVDA since my last check?"
  2. Finnhub responds: "yes, here's 2 new articles"
  3. Bot checks: "did I already post these?" (checks database)
  4. New article found → score it → if important enough → post to #news
  5. Save article ID to database so it won't post again
```

---

## How the Pieces Connect

```
┌─────────────────────────────────────────────────────────────────┐
│                        main.py                                   │
│                                                                  │
│  1. Loads config (.env for API keys, YAML for watchlist)         │
│  2. Connects to Discord                                          │
│  3. Connects to database (SQLite)                                │
│  4. Loads all 7 reporter cogs                                    │
│  5. Starts the scheduler                                         │
│  6. Sits and waits (event loop)                                  │
│                                                                  │
│  The event loop handles:                                         │
│  - Scheduled tasks firing                                        │
│  - WebSocket messages arriving                                   │
│  - Discord slash commands from users                             │
│  - Everything runs concurrently (async Python)                   │
└─────────────────────────────────────────────────────────────────┘

Shared resources (used by all reporters):
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  config.py   │  │ api_clients  │  │discord_utils │  │    db.py     │
│              │  │              │  │              │  │              │
│ API keys     │  │ Finnhub      │  │ Build embeds │  │ SQLite       │
│ Watchlist    │  │ Polygon      │  │ Format prices│  │ Save state   │
│ Channel IDs  │  │ RSS feeds    │  │ Color coding │  │ Dedup news   │
│ Alert levels │  │ Reddit       │  │ Timestamps   │  │ Track alerts │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

---

## A Normal Trading Day (Timeline)

Here's what the bot does on a typical Wednesday:

```
 6:00 AM  Bot refreshes historical price data for MA calculations
 6:30 AM  📅 Posts daily economic calendar to #econ-calendar
          💰 Posts today's earnings schedule to #earnings
          🇺🇸 Checks overnight political news → posts to #politics
 7:00 AM  📊 Posts pre-market movers to #premarket (futures + top movers)
 7:00 AM  🔔 WebSocket connects — price alerts are now active
 8:00 AM  📊 Updated pre-market movers (refreshed)
 8:15 AM  ⏰ "CPI releases in 15 minutes" alert to #econ-calendar
 8:30 AM  🚨 "CPI RELEASED: 3.3% vs 3.1% expected" to #econ-calendar
 9:00 AM  📰 News cycle starts — checking every 5 min
 9:30 AM  📊 Market open snapshot to #premarket
 9:42 AM  🔔 "NVDA broke above $150!" to #alerts (WebSocket triggered)
10:00 AM  📊 Intraday scan — unusual volume detected in PLTR → #premarket
10:05 AM  📰 Reuters article about PLTR contract → #news
10:30 AM  🇺🇸 White House announces new tariffs → #politics
12:45 PM  ⏰ "Powell speaks in 15 minutes" to #econ-calendar
 1:00 PM  🏛️ Powell speech begins — bot watches for headline keywords
 1:15 PM  📰 "Powell: 'confident inflation is cooling'" → #news (dovish!)
          ...
 3:45 PM  ⏰ "LULU reports earnings in 15 minutes" to #earnings
 4:00 PM  📊 Market close summary to #premarket
 4:05 PM  💰 "LULU BEATS — EPS $5.60 vs $5.42 est" to #earnings
 4:15 PM  📊 After-hours movers to #premarket
 6:00 PM  🔮 Daily short interest summary to #flow
 8:00 PM  Bot reduces to low-power mode (less frequent polling)
```

---

## How Users Interact

Your group members can also interact with the bot using **slash commands** (type `/` in Discord):

```
/alert above NVDA 150     → Set a price alert
/alert below TSLA 180     → Set a price alert
/alert ma AAPL 50         → Alert on 50-day MA cross
/alerts                   → See your active alerts
/alert remove 3           → Delete alert #3
/movers                   → Force refresh movers now
```

These slash commands are handled by Discord's built-in command system. When a user types `/alert above NVDA 150`:

```
1. Discord sends the command to your bot
2. Price Alerts cog receives it
3. Validates: "Is NVDA a real ticker? Is 150 a valid price?"
4. Saves to database: {ticker: NVDA, type: above, level: 150, user: carlos}
5. Subscribes to NVDA on the WebSocket (if not already)
6. Replies: "✅ Alert set: NVDA > $150.00 (currently $142.50, 5.3% away)"
```

---

## The Development → Deployment Flow

How you go from writing code to having it run:

```
YOUR MAC (development)                    SERVER (production)
┌────────────────────┐                   ┌────────────────────┐
│                    │                   │                    │
│  Write/edit code   │                   │  Runs the bot 24/5 │
│  in VS Code        │    git push       │                    │
│                    │ ──────────────►   │  Pulls latest code │
│  Test locally      │                   │  Restarts bot      │
│  (your own test    │                   │                    │
│   Discord server)  │                   │  Connected to:     │
│                    │                   │  - Discord         │
│  config/           │                   │  - Finnhub         │
│  ├── watchlist.yaml│                   │  - Polygon         │
│  ├── channels.yaml │                   │  - SQLite DB       │
│  └── .env (keys)   │                   │                    │
└────────────────────┘                   └────────────────────┘
```

1. You write code on your Mac
2. Test it with a test Discord server (so you don't spam the real one)
3. When it works, `git push` to GitHub
4. The server pulls the new code and restarts (automatic on Railway, or manual on a VPS)

---

## What If Something Breaks?

```
Bot crashes?
  → Server auto-restarts it (Docker/systemd/Railway all do this)
  → Bot reconnects to Discord and resumes

API goes down?
  → Bot catches the error, logs it, tries again next cycle
  → Falls back to secondary data source if available
  → Posts error to #bot-logs so you know

WebSocket disconnects?
  → Auto-reconnect with retry logic (built into the code)
  → Price alerts pause briefly, then resume

Discord rate limit?
  → Bot has built-in delays between messages
  → Discord allows 5 messages/second per channel (plenty)

You want to change the watchlist?
  → Edit watchlist.yaml → push to server → bot picks it up
  → Or: add a /watch TICKER slash command (Phase 2)
```

---

## Summary: The 5 Key Concepts

1. **One program, many modules** — A single Python app with 7 "reporters" inside it, each posting to their own Discord channel

2. **Three trigger types** — Scheduled (alarm clock), real-time (WebSocket stream), and polling (check every X minutes)

3. **APIs are the data** — Finnhub and Polygon give us stock prices, news, calendars, earnings. RSS feeds give us political news. All free.

4. **Discord is the output** — Everything the bot learns gets formatted into nice embeds and posted to the right channel

5. **A cheap server runs it all** — A $5/month cloud computer keeps the bot running 24/5. It auto-restarts if it crashes.
