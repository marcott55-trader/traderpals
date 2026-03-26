# TraderPals Discord Bot System

## What This Is

A suite of Discord bots that automatically post trading-relevant data to dedicated channels in our trading group server. Each bot has one job, posts to one channel, and keeps signal clean.

---

## Discord Channel Structure

| Channel           | Bot               | Purpose                                      |
| ----------------- | ----------------- | -------------------------------------------- |
| `#premarket`      | Market Movers Bot | Top gainers/losers, unusual volume, breakouts |
| `#news`           | News Bot          | Filtered breaking news by ticker + macro      |
| `#politics`       | News Bot          | White House, tariffs, executive orders, geopolitics |
| `#econ-calendar`  | Econ Bot          | Daily event schedule + pre-event alerts + Fed speeches |
| `#earnings`       | Earnings Bot      | Earnings calendar, beat/miss, post-earnings moves |
| `#alerts`         | Price Alerts Bot  | Custom levels, MA crosses, VWAP hits           |
| `#flow`           | Flow Bot          | Unusual options, dark pool, short interest      |

---

## Tech Stack

| Layer        | Choice                  | Why                                             |
| ------------ | ----------------------- | ----------------------------------------------- |
| Language     | Python 3.11+            | Best ecosystem for finance APIs + Discord        |
| Discord lib  | discord.py 2.x          | Most mature, best docs, active maintenance       |
| Market data  | Polygon.io (primary)    | Free tier: 5 calls/min. Paid ($29/mo): real-time, websockets, options |
| Market data  | Finnhub (secondary)     | Free tier: 60 calls/min. News, earnings, econ calendar |
| Market data  | yfinance (fallback)     | Free, no key needed, but unofficial + rate limited |
| Scheduling   | APScheduler             | Cron-like scheduling within Python               |
| Database     | SQLite (→ Postgres later) | Store watchlists, alert levels, user prefs      |
| Hosting      | VPS (DigitalOcean/Railway) or Raspberry Pi | Needs to run 24/5 during market hours |
| Config       | .env + YAML watchlists  | API keys in .env, ticker lists in YAML           |

---

## Project Structure

```
traderpals/
├── bots/
│   ├── common/              # Shared utilities
│   │   ├── __init__.py
│   │   ├── config.py        # Load .env + YAML config
│   │   ├── discord_utils.py # Embed builders, channel posting
│   │   ├── api_clients.py   # Polygon, Finnhub, yfinance wrappers
│   │   └── db.py            # SQLite connection + models
│   ├── market_movers/       # Bot 1: #premarket
│   │   ├── __init__.py
│   │   ├── bot.py
│   │   └── tasks.py         # Scheduled tasks
│   ├── news/                # Bot 2: #news + #politics
│   │   ├── __init__.py
│   │   ├── bot.py
│   │   ├── tasks.py
│   │   └── political.py     # Political news filtering + RSS feeds
│   ├── econ_calendar/       # Bot 3: #econ-calendar
│   │   ├── __init__.py
│   │   ├── bot.py
│   │   └── tasks.py
│   ├── earnings/            # Bot 4: #earnings
│   │   ├── __init__.py
│   │   ├── bot.py
│   │   └── tasks.py
│   ├── price_alerts/        # Bot 5: #alerts
│   │   ├── __init__.py
│   │   ├── bot.py
│   │   └── tasks.py
│   └── flow/                # Bot 6: #flow
│       ├── __init__.py
│       ├── bot.py
│       └── tasks.py
├── config/
│   ├── watchlist.yaml       # Tickers to track
│   ├── alerts.yaml          # Price levels, MA configs
│   └── channels.yaml        # Discord channel IDs
├── docs/                    # You are here
├── .env.example             # Template for API keys
├── requirements.txt
├── docker-compose.yml       # Optional: run all bots
└── main.py                  # Entry point: launches all bots
```

---

## Build Order (recommended)

1. **Common layer** — config, API wrappers, Discord embed helpers
2. **Market Movers Bot** — most visible, validates the whole pipeline
3. **Econ Calendar Bot** — simple, high value, low API cost
4. **Earnings Bot** — similar pattern to econ calendar
5. **News Bot** — needs good filtering logic
6. **Price Alerts Bot** — needs user interaction (slash commands to set levels)
7. **Flow Bot** — depends on paid data sources, build last

---

## API Keys Needed

| Service    | Free Tier                  | Paid Tier          | Sign Up                          |
| ---------- | -------------------------- | ------------------ | -------------------------------- |
| Polygon.io | 5 calls/min, delayed 15m   | $29/mo real-time   | https://polygon.io               |
| Finnhub    | 60 calls/min, US stocks    | $49/mo more data   | https://finnhub.io               |
| Discord    | Bot token (free)           | —                  | https://discord.com/developers   |
| NewsAPI    | 100 req/day (dev only)     | $449/mo production | https://newsapi.org              |

> **Start with Polygon free + Finnhub free.** That covers 90% of what you need. Upgrade Polygon to paid ($29/mo) when you want real-time data and options flow.

---

## Next Steps

**Start here if you want to understand how everything connects:**
- [10-HOW-IT-ALL-WORKS.md](10-HOW-IT-ALL-WORKS.md) — Plain English explanation of the entire system

Then read the detailed specs:
1. [01-COMMON-LAYER.md](01-COMMON-LAYER.md) — Shared code and utilities
2. [02-MARKET-MOVERS-BOT.md](02-MARKET-MOVERS-BOT.md) — #premarket bot
3. [03-ECON-CALENDAR-BOT.md](03-ECON-CALENDAR-BOT.md) — #econ-calendar bot
4. [04-EARNINGS-BOT.md](04-EARNINGS-BOT.md) — #earnings bot
5. [05-NEWS-BOT.md](05-NEWS-BOT.md) — #news bot
6. [06-PRICE-ALERTS-BOT.md](06-PRICE-ALERTS-BOT.md) — #alerts bot
7. [07-FLOW-BOT.md](07-FLOW-BOT.md) — #flow bot
8. [08-DEPLOYMENT.md](08-DEPLOYMENT.md) — Hosting and running
9. [09-DISCORD-SETUP.md](09-DISCORD-SETUP.md) — Discord server/bot configuration
