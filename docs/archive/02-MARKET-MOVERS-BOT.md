# 02 — Market Movers Bot (`#premarket`)

Posts top gainers/losers, unusual volume, and breakouts. This is the highest-visibility bot — build it first.

---

## Schedule

| Time (ET)       | Action                                      |
| --------------- | ------------------------------------------- |
| 7:00 AM         | **Pre-market snapshot** — futures + top movers |
| 8:00 AM         | **Pre-market update** — refreshed movers       |
| 9:30 AM         | **Market open** — opening moves                |
| Every 30 min    | **Intraday scan** — unusual volume + breakouts  |
| 4:00 PM         | **Market close** — daily summary                |
| 4:15 PM         | **After-hours movers** — post-close action      |

> All times Eastern. Bot should be timezone-aware and only run Mon–Fri.

---

## Data Sources

### Pre-Market Movers
- **Primary:** Polygon snapshot endpoint (`/v2/snapshot/locale/us/markets/stocks/tickers`)
  - Filter by `todaysChangePerc` > ±5%
  - Sort by absolute change percentage
  - Top 10 each direction
- **Fallback:** yfinance `pre_market_price` on watchlist tickers

### Intraday Movers
- **Primary:** Polygon gainers/losers endpoints
  - `/v2/snapshot/locale/us/markets/stocks/gainers`
  - `/v2/snapshot/locale/us/markets/stocks/losers`
- **Volume scan:** Polygon snapshot, filter where `volume > 2x avg_volume`

### Breakouts (New Highs/Lows)
- Compare current price to 52-week high/low from Polygon ticker details
- Flag if within 2% of 52-week high or making new high

---

## Discord Message Format

### Pre-Market Snapshot (7:00 AM)

```
━━━━━━━━━━━━━━━━━━━━━━
📊 PRE-MARKET MOVERS
Wednesday, March 25, 2026
━━━━━━━━━━━━━━━━━━━━━━

🔹 FUTURES
ES (S&P 500)  5,245.50  +0.35%
NQ (Nasdaq)   18,102.25 +0.52%
YM (Dow)      39,850.00 +0.18%

🟢 TOP GAINERS
1. NVDA  +8.2%  ($142.50)  Vol: 45.2M  ← Earnings beat
2. TSLA  +5.1%  ($198.30)  Vol: 32.1M
3. AMD   +4.8%  ($165.20)  Vol: 28.5M

🔴 TOP LOSERS
1. META  -6.3%  ($485.20)  Vol: 38.7M  ← Guidance cut
2. NFLX  -3.8%  ($620.10)  Vol: 15.2M
3. CRM   -2.9%  ($285.40)  Vol: 12.8M

🔊 UNUSUAL VOLUME
PLTR   Vol: 85.2M (3.2x avg)  +2.1%
SOFI   Vol: 42.1M (4.5x avg)  -1.8%
```

### Intraday Alert (when triggered)

```
embed:
  color: GREEN
  title: "🔊 Unusual Volume: PLTR"
  fields:
    - name: "Price"
      value: "$24.50 (+3.2%)"
    - name: "Volume"
      value: "85.2M (3.2x average)"
    - name: "VWAP"
      value: "$24.15 (trading above)"
  footer: "Polygon.io • 10:32 AM ET"
```

---

## Logic Flow

```
┌─────────────────────────┐
│   Scheduled trigger     │
│   (APScheduler cron)    │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│   Fetch market snapshot │
│   (Polygon API)         │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│   Process & rank        │
│   - Sort by % change    │
│   - Filter min volume   │
│   - Flag unusual volume │
│   - Check breakouts     │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│   Build Discord embed   │
│   (discord_utils.py)    │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│   Post to #premarket    │
└─────────────────────────┘
```

---

## Filters (reduce noise)

- **Minimum price:** $5 (skip penny stocks)
- **Minimum volume:** 500K shares
- **Minimum market cap:** $1B (configurable)
- **Change threshold:** ±3% for watchlist tickers, ±5% for non-watchlist
- **Unusual volume multiplier:** 2x average daily volume

---

## Slash Commands (optional, Phase 2)

```
/movers              → Force refresh of current movers
/movers premarket    → Show pre-market movers now
/volume [ticker]     → Show volume analysis for a ticker
```

---

## Implementation Notes

1. **Dedup:** Don't post the same ticker twice in 30 minutes unless the move is significantly larger
2. **Context:** When possible, add a one-line reason for the move (earnings, news, upgrade/downgrade). Cross-reference with news API.
3. **Watchlist priority:** Watchlist tickers always show even if their move is smaller than the threshold
4. **Weekend/holiday skip:** Use the `exchange_calendar` library or hardcode NYSE holidays
