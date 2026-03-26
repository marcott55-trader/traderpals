# 07 — Flow / Sentiment Bot (`#flow`)

Unusual options activity, dark pool prints, short interest, and social sentiment. This is the "edge" layer — requires paid data for the best signals.

---

## What This Bot Tracks

| Signal                  | What It Means                            | Data Source          |
| ----------------------- | ---------------------------------------- | -------------------- |
| Unusual options volume  | Big money betting on direction           | Polygon (paid) or UW |
| Large option sweeps     | Aggressive buying across exchanges       | Unusual Whales API   |
| Dark pool prints        | Large block trades off-exchange          | FINRA data (free)    |
| Short interest          | % of float sold short                    | Finnhub / FINRA      |
| Short squeeze signals   | High SI + rising price + high borrow cost | Calculated           |
| Social sentiment spikes | Sudden Reddit/Twitter buzz               | Reddit API (free)    |

---

## Data Sources

### Options Flow (best signals, requires paid)

**Option A: Polygon.io Options ($29/mo Starter plan)**
```
Endpoints:
- /v3/snapshot/options/{underlyingAsset}  → options chain snapshot
- /v2/aggs/ticker/O:{ticker}{exp}{type}{strike}/...  → options bars

What you can detect:
- Unusual options volume (compare to open interest)
- Put/call ratio extremes
- Large single-leg trades

Limitation: No sweep detection. You see volume, not individual orders.
```

**Option B: Unusual Whales API ($40-100/mo)**
```
What you get:
- Real-time option flow with sweep/block classification
- Dark pool data
- Congressional trading
- Pre-built alerts

This is the premium option. Best signal quality but costs more.
Skip for V1, add later if the group wants it.
```

### Dark Pool Data (free)

**FINRA ADF/OTC Data**
```
- FINRA publishes daily short volume data (free, next-day)
- URL: regsho.finra.org/regsho-Index.html
- Shows: total volume vs short volume for each ticker
- Parse the daily CSV files

Limitation: Next-day data only. Not real-time.
```

### Short Interest (free)

**Finnhub Short Interest**
```
Endpoint: /api/v1/stock/short-interest?symbol={ticker}
Returns: short interest data (bi-monthly updates via FINRA/exchange filings)

Calculated signals:
- Short interest ratio = short shares / avg daily volume
  (> 5 days to cover = potential squeeze)
- Short % of float
  (> 20% = elevated, > 40% = extreme)
```

### Social Sentiment (free)

**Reddit API (free with app registration)**
```
Subreddits to monitor:
- r/wallstreetbets (high noise, high signal for momentum)
- r/stocks
- r/options
- r/investing

Approach:
1. Poll top/hot posts every 15 min
2. Extract ticker mentions using regex ($AAPL, AAPL, etc.)
3. Count mentions per ticker
4. Alert when mentions spike 3x above 7-day average
```

---

## Discord Message Format

### Unusual Options Activity

```
embed:
  color: PURPLE
  title: "🔮 Unusual Options: NVDA"
  fields:
    - name: "Activity"
      value: "Heavy call buying — Apr $160 calls"
    - name: "Volume vs OI"
      value: "12,500 contracts traded (OI: 3,200) — 3.9x"
    - name: "Premium"
      value: "$8.2M total spent"
    - name: "Expiry"
      value: "April 17, 2026 (23 days)"
    - name: "Signal"
      value: "🟢 Bullish — someone is betting big on upside"
  footer: "Polygon.io • 11:30 AM ET"
```

### Short Squeeze Watch

```
embed:
  color: YELLOW
  title: "⚠️ Short Squeeze Watch: GME"
  fields:
    - name: "Short Interest"
      value: "38.2% of float"
    - name: "Days to Cover"
      value: "6.8 days"
    - name: "Cost to Borrow"
      value: "45% (extreme)"
    - name: "Price Action"
      value: "+12% this week on rising volume"
    - name: "Social Buzz"
      value: "Reddit mentions up 5x this week"
  footer: "Multiple sources • Updated 3:00 PM ET"
```

### Social Sentiment Spike

```
embed:
  color: PURPLE
  title: "📱 Social Buzz: PLTR"
  description: "Mentions spiking on Reddit — 4.2x above average"
  fields:
    - name: "Reddit Mentions (24h)"
      value: "842 (avg: 200)"
    - name: "Top Subreddit"
      value: "r/wallstreetbets"
    - name: "Sentiment"
      value: "75% bullish"
    - name: "Price"
      value: "$24.80 (+3.1%)"
  footer: "Reddit API • 2:15 PM ET"
```

---

## Schedule

| Frequency         | Action                                        |
| ----------------- | --------------------------------------------- |
| Every 15 min      | Options volume scan (market hours only)        |
| Every 30 min      | Reddit sentiment scan                          |
| Daily 6:00 PM     | Short interest summary for watchlist           |
| Daily 7:00 AM     | Dark pool summary (previous day's data)        |
| Weekly Sunday      | Short squeeze watchlist update                 |

---

## V1 vs V2 Features

### V1 (free data only)
- Short interest from Finnhub (bi-monthly updates)
- FINRA daily short volume data
- Reddit sentiment monitoring
- Basic put/call ratio from Polygon free tier (limited)

### V2 (with Polygon paid or Unusual Whales)
- Real-time unusual options volume
- Sweep/block trade detection
- Dark pool prints (same day)
- Options flow with premium data
- Congressional trading alerts

---

## Implementation Notes

1. **Start with V1.** Free data gives you short interest + Reddit sentiment, which is already useful.
2. **Reddit API rate limits:** 60 requests/minute with OAuth. More than enough for 15-min polling.
3. **Ticker extraction from Reddit:** Use regex but filter false positives. Common words like "A", "IT", "ALL", "CEO" match ticker symbols. Maintain an exclusion list.
4. **Short interest is stale:** FINRA publishes bi-monthly. Don't present it as real-time.
5. **Options flow quality:** Without sweep detection, you're just seeing volume spikes. Still useful but note the limitation.
6. **Sentiment is contrarian:** Extreme bullish sentiment often precedes drops. Present the data, don't interpret direction.
