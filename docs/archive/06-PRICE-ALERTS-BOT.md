# 06 — Price Alerts Bot (`#alerts`)

User-configurable price alerts. Members set levels via slash commands, bot watches and fires.

---

## Alert Types

| Type              | Description                          | Example                          |
| ----------------- | ------------------------------------ | -------------------------------- |
| Price Above       | Ticker crosses above a level         | NVDA > $150                      |
| Price Below       | Ticker crosses below a level         | TSLA < $180                      |
| Support Hit       | Price drops to support level         | SPY touches $520                 |
| Resistance Hit    | Price rises to resistance level      | QQQ reaches $450                 |
| MA Cross (Bull)   | Price crosses above MA              | AAPL crosses above 50-day MA     |
| MA Cross (Bear)   | Price crosses below MA              | AAPL crosses below 200-day MA    |
| VWAP Cross        | Price crosses VWAP                  | TSLA crosses above VWAP          |
| % Move            | Ticker moves ±X% in a session       | NVDA moves +5% today             |

---

## Data Source

### Real-Time Price Feed
- **Primary:** Finnhub WebSocket (`wss://ws.finnhub.io`)
  - FREE real-time trades for US stocks
  - Limit: 30 symbols simultaneously on free tier
  - Subscribe to watchlist + any tickers with active alerts
- **Supplementary:** Polygon REST snapshot (for VWAP, MA calculations)
- **Historical (for MAs):** yfinance or Polygon for past N days of closing prices

### Technical Calculations (done locally)

```python
# Moving Averages — calculate from historical close prices
# SMA(period) = sum(closes[-period:]) / period
# Supported periods: 9, 20, 50, 100, 200

# VWAP — Volume Weighted Average Price
# VWAP = cumulative(price * volume) / cumulative(volume)
# Resets daily at market open
# Requires intraday bars (1-min or 5-min) from Polygon

# These are calculated locally, not fetched from an API
```

---

## Slash Commands

```
/alert above NVDA 150
  → Alert when NVDA goes above $150

/alert below TSLA 180
  → Alert when TSLA goes below $180

/alert ma AAPL 50
  → Alert when AAPL crosses its 50-day moving average (either direction)

/alert move NVDA 5
  → Alert when NVDA moves ±5% in a single session

/alert vwap TSLA
  → Alert when TSLA crosses above/below VWAP

/alerts
  → List all your active alerts

/alert remove 3
  → Remove alert #3

/alert clear
  → Remove all your alerts
```

### Command Response Examples

```
/alert above NVDA 150

embed:
  color: BLUE
  title: "✅ Alert Set: NVDA > $150.00"
  fields:
    - name: "Current Price"
      value: "$142.50"
    - name: "Distance"
      value: "$7.50 (5.3% away)"
    - name: "Alert ID"
      value: "#7"
  footer: "Use /alerts to see all active alerts"
```

---

## Discord Message Format

### Price Alert Triggered

```
embed:
  color: GREEN (if bullish cross) / RED (if bearish cross)
  title: "🔔 ALERT: NVDA > $150.00"
  description: "@here — NVDA just broke above your $150 level"
  fields:
    - name: "Current Price"
      value: "$150.25"
    - name: "Session Change"
      value: "+4.2%"
    - name: "Volume"
      value: "52.3M (2.1x avg)"
    - name: "Set By"
      value: "@carlos"
  footer: "Alert #7 • Triggered 10:42 AM ET"
```

### MA Cross Alert

```
embed:
  color: GREEN
  title: "📈 AAPL Golden Cross — Price Above 50-Day MA"
  fields:
    - name: "Current Price"
      value: "$195.40"
    - name: "50-Day MA"
      value: "$193.20"
    - name: "200-Day MA"
      value: "$188.50"
    - name: "Signal"
      value: "Bullish — trading above both major MAs"
  footer: "Alert #12 • 11:15 AM ET"
```

---

## Logic Flow

```
WebSocket Price Feed:
  1. Connect to Finnhub WebSocket
  2. Subscribe to all tickers that have active alerts
  3. On each trade event:
     a. Update current price in memory
     b. Check all alerts for this ticker
     c. If alert triggered → post embed → mark alert as triggered

MA/VWAP Checks (every 5 minutes during market hours):
  1. For tickers with MA alerts:
     a. Fetch latest price
     b. Calculate current MA value from stored historical data
     c. Compare: was price below MA last check, now above? (or vice versa)
     d. If cross detected → fire alert

  2. For tickers with VWAP alerts:
     a. Fetch intraday bars
     b. Calculate VWAP
     c. Check for cross

Historical Data Refresh (daily at 6:00 AM):
  1. Update historical close prices for all alert tickers
  2. Recalculate MA values
  3. Store in local cache/DB
```

---

## Alert Lifecycle

```
Created (user runs /alert)
    │
    ▼
Active (monitoring via WebSocket/polling)
    │
    ▼
Triggered (posted to #alerts, marked inactive)
    │
    ├──→ One-shot: alert deleted
    └──→ Repeating: reset to active (future feature)
```

---

## Implementation Notes

1. **Finnhub WebSocket limit:** 30 symbols on free tier. If you have more than 30 tickers with alerts, rotate subscriptions or upgrade.
2. **Reconnection:** WebSocket will disconnect. Implement auto-reconnect with exponential backoff.
3. **Market hours only:** Don't fire alerts outside 4:00 AM – 8:00 PM ET (covers pre-market and after-hours).
4. **Debounce:** If price oscillates around an alert level, don't spam. Once triggered, wait 15 minutes before re-checking same level.
5. **Persistence:** All alerts in SQLite. On bot restart, reload active alerts and resubscribe.
6. **@here mentions:** Only use for alerts set by the user themselves. Don't @ everyone for every alert.
7. **Alert limits:** Max 20 active alerts per user to prevent abuse.
