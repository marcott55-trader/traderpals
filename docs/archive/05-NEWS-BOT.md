# 05 — News Bot (`#news`)

Posts filtered, relevant financial news. The hardest bot to get right — bad filtering = pure noise.

---

## Schedule

| Trigger          | Action                                     |
| ---------------- | ------------------------------------------ |
| Every 5 min      | **Poll for new news** on watchlist tickers  |
| Every 15 min     | **Poll for macro news** (Fed, rates, etc.)  |
| Instant          | **Breaking news** via Finnhub websocket     |

---

## Data Sources

### Company News
- **Primary:** Finnhub `/api/v1/company-news?symbol={ticker}&from=YYYY-MM-DD&to=YYYY-MM-DD`
  - Returns: headline, source, summary, url, datetime, related tickers
  - Free tier: full access
- **Supplementary:** Polygon `/v2/reference/news?ticker={ticker}`
  - Returns similar data with publisher info

### Market/Macro News
- **Primary:** Finnhub `/api/v1/news?category=general`
  - General market news feed
- **Fallback:** NewsAPI `/v2/everything?q=stock+market+fed+inflation`
  - Free tier: 100 req/day (dev only, not for production display)

### Political / White House News (→ posts to `#politics`)
- **Primary:** Finnhub general news, filtered by political keywords
- **Supplementary:** RSS feeds from major political news sources:
  - White House press releases: `whitehouse.gov/feed/`
  - Reuters Politics: `reuters.com/arc/outboundfeeds/v3/category/politics/`
  - AP News Politics: via AP News RSS feed
  - Politico: `politico.com/rss/politicopicks.xml`
- **Supplementary:** Reddit r/politics, r/news (poll hot posts every 15 min)
- See dedicated section below: **Political News Module**

---

## Filtering Strategy (Critical)

The #1 problem with news bots is spam. Filter aggressively:

### Relevance Filters

```python
# MUST match at least one:
relevance_rules = {
    "watchlist_mention": True,      # News mentions a watchlist ticker
    "macro_keyword": [              # Contains high-impact macro terms
        "Federal Reserve", "FOMC", "interest rate", "CPI", "inflation",
        "GDP", "recession", "tariff", "sanctions", "bank failure",
        "debt ceiling", "government shutdown"
    ],
    "event_keyword": [              # Material corporate events
        "earnings", "guidance", "acquisition", "merger", "FDA approval",
        "FDA rejection", "lawsuit", "SEC investigation", "bankruptcy",
        "stock split", "dividend", "buyback", "layoff", "CEO",
        "upgrade", "downgrade", "price target"
    ]
}
```

### Noise Filters (reject if matches)

```python
# REJECT if matches any:
noise_filters = [
    "sponsored",
    "advertisement",
    "penny stock",
    "crypto airdrop",
    "meme stock" # unless specifically watching memes
]
```

### Dedup Strategy

```python
# News often gets republished by multiple outlets
# Dedup by:
# 1. Exact headline match (hash)
# 2. Fuzzy headline match (>85% similarity using difflib)
# 3. Same ticker + same event type within 30 minutes
# 4. Store news_id in posted_news table
```

### Importance Scoring

```python
# Score each news item 0-100:
score = 0
score += 30 if ticker in tier1_watchlist
score += 15 if ticker in tier2_watchlist
score += 25 if any(kw in headline for kw in ["earnings", "FDA", "acquisition", "FOMC"])
score += 20 if source in ["Reuters", "Bloomberg", "WSJ", "CNBC"]
score += 10 if source in ["MarketWatch", "Barrons", "Financial Times"]

# Only post if score >= 30
# Add 🚨 prefix if score >= 70
```

---

## Discord Message Format

### Standard News Post

```
embed:
  color: BLUE
  title: "NVDA — Jensen Huang: 'Blackwell demand is insane'"
  description: "NVIDIA CEO says next-gen chip demand exceeds supply by 3x. Customers include all major cloud providers."
  fields:
    - name: "Source"
      value: "Reuters"
    - name: "Tickers"
      value: "NVDA, AMD, TSM"
    - name: "Impact"
      value: "🟢 Bullish — supply constraint = pricing power"
  url: "https://link-to-article"
  footer: "Finnhub • 9:15 AM ET"
```

### Breaking / High-Impact News

```
embed:
  color: RED
  title: "🚨 BREAKING: Fed Raises Rates 25bps — Higher Than Expected"
  description: "Federal Reserve raises federal funds rate to 5.75%. Markets expected a hold."
  fields:
    - name: "Key Tickers Affected"
      value: "SPY -1.2%, QQQ -1.8%, TLT -2.1%"
    - name: "What This Means"
      value: "Hawkish surprise. Expect volatility. Watch 2-year yield."
  footer: "URGENT • 2:00 PM ET"
```

---

## Logic Flow

```
Polling Loop (every 5 min for company news):
  1. For each watchlist ticker:
     - Fetch latest news from Finnhub (since last check)
     - Score each headline
     - Dedup against posted_news table
     - If score >= threshold → build embed → post
     - Store in posted_news table

Macro News Loop (every 15 min):
  1. Fetch general market news from Finnhub
  2. Filter by macro_keyword list
  3. Score and dedup
  4. Post high-scoring items

Breaking News (if using websocket):
  1. Finnhub websocket sends news events
  2. Score immediately
  3. If score >= 70 → post immediately with 🚨
```

---

## News Categories and Tags

Tag each news post so users can mentally filter:

```
📊 Earnings    — earnings reports, guidance
🏛️ Fed/Macro   — FOMC, rates, inflation
📈 Upgrade     — analyst upgrades/downgrades
🤝 M&A         — mergers, acquisitions
⚖️ Legal       — lawsuits, SEC, regulation
💊 FDA         — drug approvals, trials
👔 Management  — CEO changes, board moves
💰 Dividend    — dividend changes, buybacks
📉 Warning     — profit warnings, misses
🇺🇸 Politics   — White House, Congress, executive orders, tariffs
```

---

## Political / White House News Module (`#politics`)

Political news moves markets — tariffs, executive orders, sanctions, government shutdowns, debt ceiling fights, trade wars. This deserves its own channel.

### Why a Separate Channel
- Political news is high-volume and often divisive
- Not every political headline moves markets — filtering is critical
- Keeps `#news` focused on company/market news

### Schedule

| Trigger          | Action                                           |
| ---------------- | ------------------------------------------------ |
| Every 10 min     | Poll RSS feeds + Finnhub for political news       |
| Every 15 min     | Reddit r/politics hot posts                       |
| Instant          | Breaking political news (if score >= 70)          |

### Political Keywords (market-relevant only)

```python
# Only post political news that could move markets
# NOT general political drama

political_market_keywords = [
    # Trade & tariffs
    "tariff", "trade war", "trade deal", "import duty", "export ban",
    "sanctions", "embargo", "trade deficit",

    # Fiscal policy
    "government shutdown", "debt ceiling", "spending bill",
    "stimulus", "infrastructure bill", "budget",

    # Executive action
    "executive order", "presidential order", "White House announces",
    "signed into law",

    # Regulation
    "antitrust", "regulate", "ban", "restrict", "investigation",
    "SEC", "FTC", "DOJ", "subpoena",

    # Geopolitics (market-moving)
    "China", "Taiwan", "Russia", "Ukraine", "NATO",
    "oil embargo", "OPEC", "Middle East",

    # Tax policy
    "tax cut", "tax hike", "corporate tax", "capital gains tax",
    "tax reform",

    # Key sectors
    "defense spending", "healthcare bill", "drug pricing",
    "tech regulation", "AI regulation", "crypto regulation",
    "energy policy", "climate bill", "EV mandate"
]

# REJECT political noise that doesn't move markets:
political_noise_filters = [
    "campaign rally", "poll numbers", "approval rating",
    "primary election", "debate schedule", "fundraising",
    "endorsement", "campaign trail"
    # Exception: election RESULTS are market-moving — don't filter those
]
```

### Discord Message Format

#### Standard Political News

```
embed:
  color: 0x3C3B6E  (dark blue — US politics color)
  title: "🇺🇸 White House Announces New China Tariffs on Semiconductors"
  description: "25% tariff on Chinese chip imports effective April 1. Aims to boost domestic manufacturing."
  fields:
    - name: "Source"
      value: "Reuters"
    - name: "Market Impact"
      value: "Bullish: INTC, TXN (domestic). Bearish: NVDA, AVGO (China exposure)"
    - name: "Sectors Affected"
      value: "Semiconductors, Technology"
  url: "https://link-to-article"
  footer: "Politics • 2:30 PM ET"
```

#### Breaking Political News

```
embed:
  color: RED
  title: "🚨 BREAKING: Government Shutdown Begins at Midnight"
  description: "Congress failed to pass spending bill. Non-essential government operations suspended."
  fields:
    - name: "Market Impact"
      value: "Historically: SPY dips 1-2% then recovers. Defense/gov contractors affected most."
    - name: "Key Tickers"
      value: "LMT, RTX, GD, BOOZ — government contract exposure"
    - name: "Duration"
      value: "Unknown. Last shutdown lasted 35 days (2018-2019)"
  footer: "URGENT • 11:45 PM ET"
```

### Importance Scoring (political)

```python
score = 0
score += 30 if any(kw in headline for kw in ["tariff", "sanctions", "shutdown", "executive order"])
score += 20 if any(kw in headline for kw in ["China", "trade", "tax", "regulation"])
score += 20 if source in ["Reuters", "AP", "Bloomberg", "WSJ"]
score += 15 if "breaking" in headline.lower()
score += 10 if source in ["Politico", "CNBC", "Financial Times"]

# Only post if score >= 30
# 🚨 prefix if score >= 60
```

### Data Sources (detailed)

#### RSS Feeds (free, reliable, no API key)
```python
# Use feedparser library to parse RSS
# Poll every 10 minutes

rss_feeds = {
    "whitehouse": "https://www.whitehouse.gov/feed/",
    "reuters_politics": "https://www.reuters.com/arc/outboundfeeds/v3/category/politics/",
    "ap_politics": "https://rsshub.app/apnews/topics/politics",  # via RSSHub
    "politico": "https://www.politico.com/rss/politicopicks.xml",
    "hill": "https://thehill.com/feed/",
}
```

#### Reddit Political Sentiment
```python
# Subreddits:
# - r/politics (general)
# - r/economics (policy impact)
# - r/wallstreetbets (trader reaction to political events)

# Only surface posts that:
# 1. Match political_market_keywords
# 2. Have >500 upvotes (signal, not noise)
# 3. Are from the last 4 hours
```

---

## Implementation Notes

1. **Rate limiting on Finnhub:** With 60 calls/min and polling every 5 min across ~20 tickers, you'll use ~4 calls per cycle. Well within limits. But batch tickers if watchlist grows.
2. **News freshness:** Only post news from the last 2 hours. Older news is stale.
3. **Weekend/holiday:** Reduce polling to every 30 min outside market hours. Major breaking news can still happen.
4. **Summary generation:** For V1, use the source's summary. For V2, consider using an LLM to generate a one-line trader-friendly summary.
5. **Source quality matters:** Reuters/Bloomberg > CNBC/WSJ > MarketWatch > random blog. Weight scoring accordingly.
