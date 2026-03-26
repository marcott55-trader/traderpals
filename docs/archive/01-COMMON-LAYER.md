# 01 — Common Layer

Shared code that all bots use. Build this first.

---

## config.py — Configuration Loader

Loads API keys from `.env` and bot settings from YAML files.

```python
# What it does:
# 1. Load .env for secrets (API keys, bot tokens)
# 2. Load watchlist.yaml for tracked tickers
# 3. Load channels.yaml for Discord channel IDs
# 4. Load alerts.yaml for price alert levels
# 5. Provide typed access to all config values

# Dependencies: python-dotenv, pyyaml
```

### .env.example
```
# Discord
DISCORD_BOT_TOKEN=your_bot_token_here

# Polygon.io
POLYGON_API_KEY=your_polygon_key_here

# Finnhub
FINNHUB_API_KEY=your_finnhub_key_here

# Optional
NEWSAPI_KEY=your_newsapi_key_here
```

### watchlist.yaml
```yaml
# Tickers the bots track across all features
watchlist:
  # Core holdings / most-watched
  tier1:
    - AAPL
    - MSFT
    - NVDA
    - TSLA
    - AMZN
    - META
    - GOOGL
    - SPY
    - QQQ

  # Secondary watchlist
  tier2:
    - AMD
    - NFLX
    - CRM
    - COIN
    - PLTR
    - SOFI
    - RIVN

  # Futures / indices (for econ + macro context)
  futures:
    - ES=F    # S&P 500 futures
    - NQ=F    # Nasdaq futures
    - YM=F    # Dow futures
    - CL=F    # Crude oil
    - GC=F    # Gold
    - ZB=F    # 30-year Treasury
    - DX=F    # US Dollar Index
```

### channels.yaml
```yaml
# Discord channel IDs (right-click channel → Copy ID)
channels:
  premarket: "CHANNEL_ID_HERE"
  news: "CHANNEL_ID_HERE"
  econ_calendar: "CHANNEL_ID_HERE"
  earnings: "CHANNEL_ID_HERE"
  alerts: "CHANNEL_ID_HERE"
  flow: "CHANNEL_ID_HERE"
```

---

## api_clients.py — API Wrappers

Thin wrappers around each data source with rate limiting and error handling.

### Polygon Client

```python
# Endpoints we use:
# - GET /v2/aggs/grouped/locale/us/market/stocks/{date}  → daily bars for all tickers
# - GET /v2/aggs/ticker/{ticker}/range/...                → historical bars
# - GET /v3/reference/tickers/{ticker}                    → ticker details
# - GET /v2/snapshot/locale/us/markets/stocks/tickers     → current snapshot (all)
# - GET /v2/snapshot/locale/us/markets/stocks/gainers     → top gainers
# - GET /v2/snapshot/locale/us/markets/stocks/losers      → top losers
# - WebSocket wss://socket.polygon.io/stocks              → real-time trades (paid)

# Rate limits:
# - Free: 5 requests/minute
# - Starter ($29/mo): unlimited REST, real-time websockets

# Implementation notes:
# - Use aiohttp for async requests
# - Implement token bucket rate limiter
# - Cache responses where appropriate (e.g., ticker details)
# - Return typed dataclasses, not raw dicts
```

### Finnhub Client

```python
# Endpoints we use:
# - GET /api/v1/calendar/earnings          → earnings calendar
# - GET /api/v1/calendar/economic          → economic calendar
# - GET /api/v1/news?category=general      → market news
# - GET /api/v1/company-news               → company-specific news
# - GET /api/v1/quote                      → current price
# - GET /api/v1/stock/recommendation       → analyst recommendations
# - WebSocket wss://ws.finnhub.io          → real-time trades (free!)

# Rate limits:
# - Free: 60 calls/minute, 30 websocket symbols

# Implementation notes:
# - Finnhub websocket is FREE for real-time prices — use this for price alerts
# - Company news has a 1-year lookback
# - Economic calendar returns next 7 days by default
```

### yfinance Fallback

```python
# Use for:
# - Pre/post market data (yf.Ticker.info has preMarketPrice, postMarketPrice)
# - Historical data when Polygon free tier is exhausted
# - Ticker validation and basic info

# Caveats:
# - Unofficial API, can break
# - No guaranteed rate limits (be conservative: 1 req/sec)
# - Not suitable for real-time
```

---

## discord_utils.py — Embed Builders

Helper functions to build consistent, good-looking Discord embeds.

### Embed Templates

```python
# Every bot uses embeds with a consistent style:

# Color coding:
#   GREEN  = 0x00FF00  → bullish / positive / beat
#   RED    = 0xFF0000  → bearish / negative / miss
#   BLUE   = 0x0099FF  → informational / neutral
#   YELLOW = 0xFFCC00  → warning / alert / upcoming event
#   PURPLE = 0x9B59B6  → options / flow data

# Standard embed structure:
#   Title:       Short, scannable headline
#   Description: 2-3 lines max
#   Fields:      Key-value pairs for data
#   Footer:      Data source + timestamp
#   Thumbnail:   Optional ticker logo

# Helper functions to build:
# - market_mover_embed(ticker, change_pct, volume, price)
# - news_embed(headline, source, tickers, summary)
# - econ_event_embed(event_name, time, forecast, previous, actual=None)
# - earnings_embed(ticker, eps_actual, eps_est, rev_actual, rev_est)
# - price_alert_embed(ticker, alert_type, level, current_price)
# - flow_embed(ticker, flow_type, details)
```

### Formatting Helpers

```python
# format_price(price)          → "$142.50"
# format_change(change_pct)    → "+3.45%" or "-2.10%" (with color emoji)
# format_volume(volume)        → "12.5M" or "892K"
# format_market_cap(cap)       → "$2.1T"
# ticker_emoji(change)         → "🟢" if positive, "🔴" if negative
# time_until(dt)               → "in 15 min" or "2 hours ago"
```

---

## db.py — Database Layer

SQLite for storing persistent state. Keep it simple.

### Tables

```sql
-- Tickers being tracked (beyond the YAML watchlist)
CREATE TABLE tracked_tickers (
    ticker TEXT PRIMARY KEY,
    added_by TEXT,           -- Discord user ID
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tier TEXT DEFAULT 'custom'  -- tier1, tier2, custom
);

-- Price alert levels set by users
CREATE TABLE price_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    alert_type TEXT NOT NULL,  -- 'above', 'below', 'cross_ma'
    level REAL,                -- price level (NULL for MA crosses)
    ma_period INTEGER,         -- for MA cross alerts (e.g., 50, 200)
    created_by TEXT,           -- Discord user ID
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    triggered_at TIMESTAMP,    -- NULL until triggered
    active BOOLEAN DEFAULT 1
);

-- News already posted (dedup)
CREATE TABLE posted_news (
    news_id TEXT PRIMARY KEY,  -- hash of headline + source
    ticker TEXT,
    posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Earnings already posted (dedup)
CREATE TABLE posted_earnings (
    ticker TEXT,
    report_date TEXT,
    posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticker, report_date)
);
```

---

## Rate Limiter

```python
# Simple async token bucket rate limiter
# Each API client gets its own limiter:
#   - Polygon free:  5 tokens, refill 5/minute
#   - Polygon paid:  unlimited (no limiter)
#   - Finnhub:       60 tokens, refill 60/minute
#   - yfinance:      1 token, refill 1/second

# Usage:
#   async with rate_limiter:
#       response = await client.get(url)
```

---

## Error Handling

```python
# All API calls should:
# 1. Retry on 429 (rate limit) with exponential backoff
# 2. Retry on 5xx (server error) up to 3 times
# 3. Log errors but never crash the bot
# 4. Fall back to secondary data source when primary fails
# 5. Post to a #bot-logs channel on repeated failures
```
