# 04 — Earnings Bot (`#earnings`)

Posts daily earnings calendar, alerts before reports, and beat/miss results.

---

## Schedule

| Time (ET)       | Action                                               |
| --------------- | ---------------------------------------------------- |
| 6:30 AM         | **Daily earnings calendar** — who reports today       |
| 15 min before   | **Pre-earnings alert** — for watchlist tickers only   |
| After release   | **Earnings result** — beat/miss with price reaction   |
| Sunday 8:00 PM  | **Week ahead** — full week earnings preview           |

---

## Data Sources

### Earnings Calendar
- **Primary:** Finnhub `/api/v1/calendar/earnings`
  - Returns: ticker, date, EPS estimate, EPS actual, revenue estimate, revenue actual, hour (bmo/amc/dmh)
  - Free tier: full access
- **Supplementary:** Polygon `/v3/reference/tickers/{ticker}` for company details

### Earnings Terms
```
BMO = Before Market Open (pre-market, typically 6-9:30 AM ET)
AMC = After Market Close (after-hours, typically 4-6 PM ET)
DMH = During Market Hours (rare)
```

---

## Discord Message Format

### Daily Earnings Calendar (6:30 AM)

```
━━━━━━━━━━━━━━━━━━━━━━━━
💰 EARNINGS TODAY
Wednesday, March 25, 2026
━━━━━━━━━━━━━━━━━━━━━━━━

🌅 BEFORE MARKET OPEN
⭐ NVDA   EPS Est: $0.82   Rev Est: $28.5B   ← ON WATCHLIST
   MU     EPS Est: $1.05   Rev Est: $8.7B
   LEN    EPS Est: $3.45   Rev Est: $8.9B

🌙 AFTER MARKET CLOSE
⭐ LULU   EPS Est: $5.42   Rev Est: $3.2B    ← ON WATCHLIST
   MKC    EPS Est: $0.65   Rev Est: $1.7B

⭐ = on your watchlist
```

### Pre-Earnings Alert (15 min before)

```
embed:
  color: YELLOW
  title: "⏰ NVDA Reports in 15 Minutes"
  fields:
    - name: "Expected"
      value: "EPS: $0.82 | Revenue: $28.5B"
    - name: "Reporting"
      value: "Before Market Open"
    - name: "Previous Quarter"
      value: "EPS: $0.78 (beat by $0.05) | Revenue: $26.0B (beat)"
    - name: "Implied Move"
      value: "±6.2% (from options pricing)"
  footer: "Buckle up."
```

### Earnings Result

```
embed:
  color: GREEN
  title: "✅ NVDA BEATS — EPS $0.89 vs $0.82 est"
  fields:
    - name: "EPS"
      value: "$0.89 vs $0.82 est (+8.5% beat)"
    - name: "Revenue"
      value: "$29.1B vs $28.5B est (+2.1% beat)"
    - name: "Stock Reaction"
      value: "+5.2% after-hours ($149.80)"
    - name: "Key Takeaway"
      value: "Data center revenue up 40% YoY. Raised guidance."
  footer: "Finnhub • 4:05 PM ET"
```

---

## Logic Flow

```
Daily Calendar (6:30 AM):
  1. Fetch this week's earnings from Finnhub
  2. Filter to today's date
  3. Cross-reference with watchlist → mark with ⭐
  4. Sort: watchlist first, then by market cap
  5. Group by BMO / AMC
  6. Post to #earnings

Pre-Earnings Alerts:
  1. For watchlist tickers reporting today:
     - BMO tickers → alert at 6:15 AM (or 15 min before known time)
     - AMC tickers → alert at 3:45 PM
  2. Include previous quarter results for context

Result Tracking:
  1. For BMO: start polling at 6:00 AM, every 2 minutes
  2. For AMC: start polling at 4:00 PM, every 2 minutes
  3. When Finnhub returns actual EPS/revenue → post result
  4. Fetch post-earnings price move from Polygon
  5. Stop polling after 2 hours if no result
```

---

## Earnings Context (auto-generated)

For watchlist tickers, enrich the earnings post with:
- **Previous quarter:** Last EPS/revenue + beat/miss
- **Streak:** "Beat 4 of last 5 quarters"
- **Price reaction history:** "Average post-earnings move: ±5.3%"
- **Guidance note:** If available, note raised/lowered/maintained guidance

---

## Week Ahead Preview (Sunday 8 PM)

```
━━━━━━━━━━━━━━━━━━━━━━━━━
💰 EARNINGS WEEK AHEAD
March 23 - March 28, 2026
━━━━━━━━━━━━━━━━━━━━━━━━━

MONDAY    3/23   — DAL, CCL
TUESDAY   3/24   — ⭐ AAPL, NKE, FDX
WEDNESDAY 3/25   — ⭐ NVDA, MU, ⭐ LULU
THURSDAY  3/26   — ⭐ COST, WBA
FRIDAY    3/27   — (no major earnings)

⭐ = on your watchlist
Most anticipated: NVDA (Wed BMO), AAPL (Tue AMC)
```

---

## Implementation Notes

1. **Finnhub earnings data timing:** `actual` fields may not populate immediately. Poll for up to 2 hours after expected report time.
2. **Whisper numbers:** If you want to add "whisper" EPS (the street's unofficial estimate), this requires scraping or a premium source. Skip for V1.
3. **Implied move:** Calculated from options straddle pricing. Requires options data (Polygon paid tier). Nice-to-have, not V1.
4. **Dedup:** Don't re-post results. Track in `posted_earnings` table.
5. **Special events:** Some tickers have earnings calls at unusual times. Don't hardcode BMO=7AM/AMC=4PM.
