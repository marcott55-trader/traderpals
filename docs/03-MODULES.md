# Bot Modules — Detailed Specs

This is the canonical reference for what each module does, when it runs, what data it uses, and what it posts.

---

## 1. Market Movers (`market-movers.ts` → `#premarket`)

### Schedule

| Inngest Cron            | Time (ET)                    | Action                        |
| ----------------------- | ---------------------------- | ----------------------------- |
| `0 7 * * 1-5`          | 7:00 AM                     | Pre-market snapshot           |
| `0 8 * * 1-5`          | 8:00 AM                     | Pre-market update             |
| `30 9 * * 1-5`         | 9:30 AM                     | Market open snapshot          |
| `*/30 10-15 * * 1-5`   | Every 30 min, 10AM–3:30PM   | Intraday scan                 |
| `0 16 * * 1-5`         | 4:00 PM                     | Market close summary          |
| `15 16 * * 1-5`        | 4:15 PM                     | After-hours movers            |

### Data Sources
- **Polygon** `/v2/snapshot/locale/us/markets/stocks/gainers` and `/losers`
- **Polygon** `/v2/snapshot/locale/us/markets/stocks/tickers` (full snapshot, filter by volume)
- **Finnhub** `/api/v1/quote` for futures (ES, NQ, YM) — or yfinance for ES=F, NQ=F, YM=F

### Filters
- Minimum price: $5
- Minimum volume: 500K shares
- Minimum market cap: $1B
- Change threshold: ±3% for watchlist, ±5% for non-watchlist
- Unusual volume: > 2x average daily volume

### Embed Format

**Pre-market snapshot:**
```
Title:  "📊 PRE-MARKET MOVERS — Wednesday, March 25"
Color:  BLUE (0x0099FF)

Fields:
  🔹 FUTURES
  ES +0.35%  NQ +0.52%  YM +0.18%

  🟢 TOP GAINERS
  1. NVDA  +8.2%  $142.50  Vol: 45.2M
  2. TSLA  +5.1%  $198.30  Vol: 32.1M

  🔴 TOP LOSERS
  1. META  -6.3%  $485.20  Vol: 38.7M

  🔊 UNUSUAL VOLUME
  PLTR  Vol: 85.2M (3.2x avg)  +2.1%

Footer: "Polygon.io • 7:00 AM ET"
```

### Dedup
Don't post the same ticker twice within 30 minutes unless the move increased by >2%.

---

## 2. News (`news-scan.ts` → `#news`)

### Schedule

| Inngest Cron            | Window              | Action              |
| ----------------------- | ------------------- | ------------------- |
| `*/5 6-20 * * 1-5`     | Every 5 min, 6AM-8PM weekdays | Company news scan |
| `*/15 6-20 * * 1-5`    | Every 15 min        | Macro/general news  |

### Data Sources
- **Finnhub** `/api/v1/company-news?symbol={ticker}` for each watchlist ticker
- **Finnhub** `/api/v1/news?category=general` for macro news

### Filtering

**Score each headline 0–100. Only post if score >= 30. Add 🚨 if score >= 70.**

```
+30  Ticker is in tier1 watchlist
+15  Ticker is in tier2 watchlist
+25  Headline contains: "earnings", "FDA", "acquisition", "FOMC"
+20  Source is: Reuters, Bloomberg, WSJ, CNBC
+10  Source is: MarketWatch, Barrons, Financial Times
```

**Reject if headline contains:** "sponsored", "advertisement", "penny stock", "crypto airdrop"

**Dedup:**
- Hash headline → check `posted_news` table
- Fuzzy match: >85% similar to a recent post → skip
- Same ticker + same event type within 30 min → skip

### Embed Format
```
Title:  "NVDA — Jensen Huang: 'Blackwell demand is insane'"
Color:  BLUE (company), RED (breaking), YELLOW (⚠️ warning)
Description: 1-2 sentence summary
Fields:
  Source: Reuters
  Tickers: NVDA, AMD, TSM
  Tag: 📊 Earnings / 🏛️ Fed / 🤝 M&A / ⚖️ Legal / 💊 FDA / etc.
URL:    Link to article
Footer: "Finnhub • 9:15 AM ET"
```

### Tags
```
📊 Earnings     🏛️ Fed/Macro    📈 Upgrade/Downgrade
🤝 M&A          ⚖️ Legal/SEC    💊 FDA
👔 Management   💰 Dividend     📉 Warning
```

---

## 3. Political News (`political-scan.ts` → `#politics`)

### Schedule

| Inngest Cron      | Window  | Action             |
| ----------------- | ------- | ------------------ |
| `*/10 * * * *`    | 24/7    | RSS + Finnhub scan |

Runs 24/7 because major political events (executive orders, geopolitical crises) happen outside market hours.

### Data Sources
- **RSS feeds:**
  - White House: `whitehouse.gov/feed/`
  - Reuters Politics
  - AP News Politics
  - Politico: `politico.com/rss/politicopicks.xml`
  - The Hill: `thehill.com/feed/`
- **Finnhub** general news, filtered by political keywords

### Filtering

**Only post political news that could move markets.** This is the most important filter in the entire system.

**Market-relevant keywords (must match at least one):**
```
Tariff, trade war, trade deal, sanctions, embargo
Government shutdown, debt ceiling, spending bill, stimulus
Executive order, signed into law
Antitrust, SEC, FTC, DOJ, regulation, ban
China, Taiwan, Russia, Ukraine, OPEC, Middle East
Tax cut, tax hike, corporate tax, capital gains tax
Defense spending, healthcare bill, drug pricing
Tech regulation, AI regulation, crypto regulation
```

**Noise rejection (skip if matches):**
```
Campaign rally, poll numbers, approval rating
Primary election, debate schedule, fundraising, endorsement
```

Exception: election **results** are market-moving — don't filter those.

**Score: same 0-100 system as news. Only post if >= 30.**

### Embed Format
```
Title:  "🇺🇸 White House Announces New China Tariffs on Semiconductors"
Color:  0x3C3B6E (dark blue)
Description: Summary + which sectors are affected
Fields:
  Source: Reuters
  Market Impact: Bullish: INTC, TXN. Bearish: NVDA, AVGO.
  Sectors: Semiconductors, Technology
Footer: "Politics • 2:30 PM ET"
```

---

## 4. Economic Calendar (`econ-calendar.ts` → `#econ-calendar`)

### Schedule

| Inngest Cron             | Action                                     |
| ------------------------ | ------------------------------------------ |
| `30 6 * * 1-5`          | Daily calendar post                        |
| `* 6-16 * * 1-5`        | Pre-event alerts (15 min before high-impact)|
| `* 6-16 * * 1-5`        | Result drops (poll for actuals)            |
| `0 20 * * 0`            | Week-ahead preview (Sunday 8 PM)           |

### Data Sources
- **Finnhub** `/api/v1/calendar/economic` — events with time, forecast, previous, actual, impact
- **Federal Reserve calendar** (primary source for Fed events):
  - URL: `https://www.federalreserve.gov/newsevents/calendar.htm`
  - Scraped daily at 6:00 AM ET (before the daily calendar post)
  - Provides: FOMC meetings, Fed speeches, testimony, minutes releases, Beige Book
  - Includes speaker name, topic, time, and location
  - This is the authoritative source — Finnhub may miss speeches or lack speaker detail
  - The Fed also publishes an iCal feed at `https://www.federalreserve.gov/newsevents/calendar.ics` which is easier to parse than HTML
- **Merge strategy:** Fetch both Finnhub economic events and Fed calendar. Deduplicate by matching event type + date. Fed calendar wins for Fed-specific events (speeches, FOMC, testimony). Finnhub wins for everything else (CPI, NFP, GDP, etc.).

### Event Categories

| Category      | Examples                              | Impact   |
| ------------- | ------------------------------------- | -------- |
| Employment    | NFP, Jobless Claims, ADP             | High     |
| Inflation     | CPI, PPI, PCE                        | High     |
| Central Bank  | FOMC Decision, Fed Minutes           | High     |
| Fed Speeches  | Powell, Waller, Bowman, etc.         | High     |
| GDP           | GDP, GDP Revision                    | High     |
| Manufacturing | ISM, PMI                             | Medium   |
| Housing       | Housing Starts, Existing Home Sales  | Medium   |
| Consumer      | Retail Sales, Consumer Confidence    | Medium   |
| Trade         | Trade Balance                        | Low      |

### Fed Speech Handling

Fed speakers get special treatment:

- Tag whether speaker is a **voting FOMC member** (Chair/Vice Chair/Governors always vote; regional presidents rotate annually)
- Voting member list is maintained in `src/lib/fed-calendar.ts` — update at the start of each year when rotations are announced
- Include topic if available (from Fed iCal description field)
- Hawkish keywords to flag post-speech: "restrictive", "higher for longer", "not yet confident", "more work to do"
- Dovish keywords: "progress on inflation", "confident", "approaching target", "appropriate to cut"

```
Embed:
  Title: "🏛️ Fed Chair Powell Speaks in 15 Minutes"
  Color: YELLOW
  Fields:
    Time: 1:00 PM ET
    Speaker: Jerome Powell (Fed Chair) — VOTING MEMBER
    Topic: "Economic Outlook and Monetary Policy"
    Why It Matters: "Fed Chair comments move markets instantly."
  Footer: "⚠️ Expect volatility"
```

### Result Drops

When an event's actual value is published:

```
Embed:
  Title: "🚨 CPI RELEASED: 3.3% (vs 3.1% expected)"
  Color: RED (worse than expected) / GREEN (better)
  Fields:
    Actual: 3.3% ⚠️
    Forecast: 3.1%
    Previous: 3.2%
  Footer: "Finnhub • 8:30 AM ET"
```

### Implementation Detail
- After the daily calendar post, cache today's events in Supabase `econ_events` table
- The per-minute function checks this table: "any event 15 min away where alert_sent = false?"
- For result drops: "any event where actual is NULL and event_time has passed?" → poll Finnhub for actual

---

## 5. Earnings (`earnings.ts` → `#earnings`)

### Schedule

| Inngest Cron                | Action                              |
| --------------------------- | ----------------------------------- |
| `30 6 * * 1-5`             | Daily earnings calendar             |
| `15 6 * * 1-5`             | Pre-report alert (BMO watchlist)    |
| `45 15 * * 1-5`            | Pre-report alert (AMC watchlist)    |
| `*/2 6-9 * * 1-5`          | Result tracking (BMO window)        |
| `*/2 16-20 * * 1-5`        | Result tracking (AMC window)        |
| `0 20 * * 0`               | Week-ahead preview (Sunday 8 PM)   |

### Data Sources
- **Finnhub** `/api/v1/calendar/earnings` — date, ticker, EPS estimate, EPS actual, revenue estimate, revenue actual, hour (bmo/amc)

### Terms
```
BMO = Before Market Open (pre-market, 6–9:30 AM ET)
AMC = After Market Close (after-hours, 4–8 PM ET)
```

### Embed Formats

**Daily calendar:**
```
Title: "💰 EARNINGS TODAY — Wednesday, March 25"
Fields:
  🌅 BEFORE MARKET OPEN
  ⭐ NVDA   EPS Est: $0.82   Rev Est: $28.5B
     MU     EPS Est: $1.05   Rev Est: $8.7B

  🌙 AFTER MARKET CLOSE
  ⭐ LULU   EPS Est: $5.42   Rev Est: $3.2B
```

**Result:**
```
Title: "✅ NVDA BEATS — EPS $0.89 vs $0.82 est"  (or ❌ MISSES)
Color: GREEN (beat) / RED (miss)
Fields:
  EPS: $0.89 vs $0.82 est (+8.5% beat)
  Revenue: $29.1B vs $28.5B est (+2.1% beat)
  Stock Reaction: +5.2% after-hours ($149.80)
```

### Dedup
Track in `posted_earnings` table by (ticker, report_date). Don't re-post results.

---

## 6. Price Alerts (`price-alerts.ts` → `#alerts`)

### Schedule

| Inngest Cron           | Action                              |
| ---------------------- | ----------------------------------- |
| `* 9-16 * * 1-5`      | Price check every 1 min (regular hours) |
| `*/5 4-9,16-20 * * 1-5` | Price check every 5 min (extended hours) |
| `0 6 * * 1-5`         | Daily MA recalculation              |

### Alert Types

| Type         | Trigger                        | Example                   |
| ------------ | ------------------------------ | ------------------------- |
| `above`      | Price crosses above level      | NVDA > $150               |
| `below`      | Price crosses below level      | TSLA < $180               |
| `ma_cross`   | Price crosses a moving average | AAPL crosses 50-day MA    |
| `vwap`       | Price crosses VWAP             | TSLA crosses VWAP         |
| `pct_move`   | Ticker moves ±X% in session    | NVDA moves ±5% today      |

### Slash Commands

```
/alert above NVDA 150       → Set price alert
/alert below TSLA 180       → Set price alert
/alert ma AAPL 50           → Alert on 50-day MA cross
/alert vwap TSLA            → Alert on VWAP cross
/alert move NVDA 5          → Alert on ±5% session move
/alerts                     → List your active alerts
/alert remove 3             → Remove alert #3
/alert clear                → Remove all your alerts
```

### Latency
Alerts fire within **60 seconds** of the price crossing the level during regular hours, or within **5 minutes** during extended hours. This is polling, not real-time streaming.

### Lifecycle
```
Created → Active → Triggered → Inactive (one-shot)
```
Once triggered, the alert is marked inactive and not checked again.

### Guard Rails
- Max 20 active alerts per user
- Debounce: if price oscillates around level, 15-min cooldown before re-alerting
- Only fire during 4 AM – 8 PM ET (covers pre-market through after-hours)

### Embed Format
```
Title: "🔔 ALERT: NVDA > $150.00"
Color: GREEN (bullish cross) / RED (bearish cross)
Description: "NVDA just broke above your $150 level"
Fields:
  Current Price: $150.25
  Session Change: +4.2%
  Volume: 52.3M (2.1x avg)
  Set By: @carlos
Footer: "Alert #7 • Triggered 10:42 AM ET"
```

---

## 7. Flow / Sentiment (`flow-scan.ts` → `#flow`)

### Schedule

| Inngest Cron           | Action                          |
| ---------------------- | ------------------------------- |
| `*/15 9-16 * * 1-5`   | Options volume scan             |
| `*/30 * * * *`         | Reddit sentiment scan           |
| `0 18 * * 1-5`        | Daily short interest summary    |
| `0 7 * * 1-5`         | Dark pool summary (previous day)|
| `0 20 * * 0`          | Weekly short squeeze watchlist  |

### V1 (free data only)

| Signal              | Source              | Quality                              |
| ------------------- | ------------------- | ------------------------------------ |
| Options volume      | yfinance chains     | Basic — volume vs OI, no sweep data  |
| Short interest      | Finnhub             | Bi-monthly updates (stale)           |
| Short volume (daily)| FINRA CSV files     | Next-day, free                       |
| Reddit sentiment    | Reddit API          | Good for buzz detection              |
| StockTwits sentiment| StockTwits API      | Free, bullish/bearish counts         |

### V2 Upgrades (paid)

| Signal              | Source              | Cost                    |
| ------------------- | ------------------- | ----------------------- |
| Real-time options flow | Polygon Starter  | $29/mo                  |
| Sweep/block trades  | Unusual Whales      | $57-97/mo               |
| Same-day dark pool  | Unusual Whales      | included                |

### Reddit Ticker Extraction
- Match `$AAPL`, `AAPL` in post titles and top comments
- Exclude false positives: common words that match tickers (A, IT, ALL, CEO, DD, EV, GO, AI)
- Alert when mentions spike 3x above 7-day rolling average

### Embed Formats

**Unusual options:**
```
Title: "🔮 Unusual Options: NVDA"
Color: PURPLE (0x9B59B6)
Fields:
  Activity: Heavy call buying — Apr $160 calls
  Volume vs OI: 12,500 (OI: 3,200) — 3.9x
  Signal: 🟢 Bullish
```

**Reddit sentiment spike:**
```
Title: "📱 Social Buzz: PLTR"
Color: PURPLE
Fields:
  Reddit Mentions (24h): 842 (avg: 200)
  Sentiment: 75% bullish
  Price: $24.80 (+3.1%)
```

---

## Shared Embed Conventions

All modules use the same formatting:

| Element    | Rule                                          |
| ---------- | --------------------------------------------- |
| Colors     | GREEN (0x00FF00) = bullish/beat, RED (0xFF0000) = bearish/miss, BLUE (0x0099FF) = info, YELLOW (0xFFCC00) = warning/upcoming, PURPLE (0x9B59B6) = options/flow, 0x3C3B6E = politics |
| Prices     | `$142.50` — always with dollar sign, 2 decimals |
| Changes    | `+3.45%` or `-2.10%` — always with sign         |
| Volume     | `12.5M` or `892K` — human-readable              |
| Timestamps | `10:32 AM ET` — always Eastern                  |
| Footer     | Data source + timestamp                          |
| Watchlist  | ⭐ prefix for tickers on the group's watchlist   |
