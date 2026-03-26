# 03 — Economic Calendar Bot (`#econ-calendar`)

Posts the daily economic event schedule and sends alerts before major releases.

---

## Schedule

| Time (ET)       | Action                                              |
| --------------- | --------------------------------------------------- |
| 6:30 AM         | **Daily calendar** — all events for today            |
| 15 min before   | **Pre-event alert** — reminder for high-impact events |
| On release      | **Result drop** — actual vs forecast vs previous     |
| Sunday 8:00 PM  | **Week ahead** — full week calendar preview          |

---

## Data Sources

### Economic Calendar
- **Primary:** Finnhub `/api/v1/calendar/economic`
  - Returns events with: event name, country, date, time, impact, forecast, previous, actual
  - Free tier covers this fully
- **Fallback:** Scrape Investing.com economic calendar (as backup only)

### Event Categories to Track

| Category          | Examples                           | Impact |
| ----------------- | ---------------------------------- | ------ |
| Employment        | NFP, Jobless Claims, ADP           | High   |
| Inflation         | CPI, PPI, PCE                      | High   |
| Central Bank      | FOMC Decision, Fed Minutes, Powell  | High   |
| **Fed Speeches**  | **Powell, Waller, Bowman, etc.**   | **High** |
| GDP               | GDP, GDP Revision                  | High   |
| Manufacturing     | ISM, PMI                           | Medium |
| Housing           | Housing Starts, Existing Home Sales | Medium |
| Consumer          | Retail Sales, Consumer Confidence   | Medium |
| Trade             | Trade Balance                      | Low    |

---

## Fed Speech Tracking (dedicated feature)

Fed officials speaking is one of the most market-moving events outside of data releases. The bot tracks these specifically.

### Data Source
- **Finnhub economic calendar** includes Fed speeches as events
- **Supplementary:** Fed's official calendar at federalreserve.gov/newsevents/calendar.htm
  - Scrape weekly for upcoming speeches, testimony, and appearances
  - Cross-reference with Finnhub to catch anything missed

### What to Track

| Event Type                  | Impact    | Example                                  |
| --------------------------- | --------- | ---------------------------------------- |
| Fed Chair press conference  | Extreme   | Powell post-FOMC presser                  |
| Fed Chair testimony         | Extreme   | Humphrey-Hawkins (semi-annual to Congress)|
| Fed Chair speech            | High      | Powell at Jackson Hole, Brookings, etc.   |
| Fed Governor speech         | Medium    | Waller, Bowman, Cook at conferences       |
| Regional Fed President      | Medium    | Kashkari, Goolsbee, Daly, Bostic, etc.   |
| Fed meeting minutes release | High      | FOMC minutes (3 weeks after meeting)      |

### Fed Speech Alert Format

```
embed:
  color: YELLOW
  title: "🏛️ Fed Chair Powell Speaks in 15 Minutes"
  description: "Speech at Brookings Institution — Topic: 'Economic Outlook and Monetary Policy'"
  fields:
    - name: "Time"
      value: "1:00 PM ET"
    - name: "Speaker"
      value: "Jerome Powell (Fed Chair) — VOTING MEMBER"
    - name: "Context"
      value: "Markets watching for rate cut signals. Last speech was hawkish."
    - name: "Why It Matters"
      value: "Fed Chair comments move markets instantly. Watch for keywords: 'restrictive', 'data-dependent', 'patient', 'confident'."
  footer: "⚠️ Expect volatility. Set your stops."
```

### Fed Keyword Watchlist

When parsing post-speech headlines, flag these keywords:

```python
fed_hawkish_keywords = [
    "restrictive", "higher for longer", "not yet confident",
    "more work to do", "premature", "inflation persistent",
    "strong labor market", "overheating"
]

fed_dovish_keywords = [
    "progress on inflation", "confident", "approaching target",
    "slowing", "cooling", "appropriate to cut", "recalibrate",
    "restrictive enough", "balanced risks"
]
```

### Voting vs Non-Voting

Not all Fed speakers move markets equally. Tag whether the speaker is a **voting FOMC member** this year (rotates annually for regional presidents). Chair/Vice Chair/Governors always vote.

---

## Discord Message Format

### Daily Calendar (6:30 AM)

```
━━━━━━━━━━━━━━━━━━━━━━━━
📅 ECONOMIC CALENDAR
Wednesday, March 25, 2026
━━━━━━━━━━━━━━━━━━━━━━━━

🔴 HIGH IMPACT
8:30 AM   CPI (YoY)         Forecast: 3.1%   Previous: 3.2%
8:30 AM   Core CPI (MoM)    Forecast: 0.3%   Previous: 0.4%
1:00 PM   🏛️ Powell Speech   Brookings Institution
2:00 PM   FOMC Minutes

🟡 MEDIUM IMPACT
10:00 AM  New Home Sales     Forecast: 680K   Previous: 664K
10:30 AM  Crude Oil Inv.     Forecast: -1.2M  Previous: -2.5M

🔵 LOW IMPACT
7:00 AM   MBA Mortgage Apps  Previous: -5.1%
```

### Pre-Event Alert (15 min before)

```
embed:
  color: YELLOW
  title: "⏰ CPI Release in 15 Minutes"
  description: "Consumer Price Index — one of the most market-moving reports"
  fields:
    - name: "Time"
      value: "8:30 AM ET"
    - name: "Forecast"
      value: "3.1% YoY"
    - name: "Previous"
      value: "3.2% YoY"
    - name: "Why It Matters"
      value: "Higher than expected = hawkish Fed = bearish stocks. Lower = dovish = bullish."
  footer: "Set your stops. Volatility incoming."
```

### Result Drop (on release)

```
embed:
  color: RED (if worse than expected) / GREEN (if better)
  title: "🚨 CPI RELEASED: 3.3% (vs 3.1% expected)"
  description: "HOTTER THAN EXPECTED — bearish signal"
  fields:
    - name: "Actual"
      value: "3.3% ⚠️"
    - name: "Forecast"
      value: "3.1%"
    - name: "Previous"
      value: "3.2%"
    - name: "Immediate Reaction"
      value: "ES -0.8%, NQ -1.2%, DXY +0.4%"
  footer: "Finnhub • 8:30 AM ET"
```

---

## Logic Flow

```
Daily Calendar Post (6:30 AM):
  1. Fetch today's events from Finnhub
  2. Filter: US events only (configurable)
  3. Sort by time, group by impact level
  4. Build embed, post to #econ-calendar

Pre-Event Alerts:
  1. After daily post, schedule alerts for each high-impact event
  2. 15 minutes before event time → post reminder embed
  3. Use APScheduler one-shot jobs for each alert

Result Drops:
  1. Poll Finnhub every 60 seconds around event time (±5 min window)
  2. When "actual" field appears → post result embed
  3. Compare actual vs forecast to determine sentiment (green/red)
  4. Optionally fetch ES/NQ reaction from Polygon
```

---

## Impact Explanations

For each major event type, store a brief "Why It Matters" blurb:

```yaml
event_context:
  CPI:
    why: "Measures inflation. Higher = Fed hikes = bearish. Lower = dovish = bullish."
    affects: ["SPY", "QQQ", "TLT", "DXY"]
  NFP:
    why: "Jobs report. Strong = economy healthy but Fed may tighten. Weak = recession fears."
    affects: ["SPY", "DXY", "GLD"]
  FOMC:
    why: "Fed rate decision. THE most important event for markets."
    affects: ["Everything"]
  Fed_Speech:
    why: "Fed officials can move markets with a single sentence. Chair > Governors > Regional Presidents."
    affects: ["SPY", "QQQ", "TLT", "DXY", "GLD"]
  PCE:
    why: "Fed's preferred inflation gauge. Moves slower than CPI but Fed watches it more."
    affects: ["SPY", "QQQ", "TLT"]
  GDP:
    why: "Economic growth rate. Below 0% = recession signal."
    affects: ["SPY", "DXY"]
```

---

## Implementation Notes

1. **Timezone handling:** All events stored in ET. Use `pytz` or `zoneinfo` (Python 3.9+)
2. **Polling for results:** Only poll during event windows, not continuously
3. **Dedup:** Track posted events by date + event name
4. **FOMC special handling:** FOMC meetings are 2-day events. Post reminders for both days. Statement at 2:00 PM, press conference at 2:30 PM.
5. **Market hours awareness:** Some events release before market open — still post them
