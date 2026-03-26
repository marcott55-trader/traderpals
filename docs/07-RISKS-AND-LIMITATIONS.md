# Risks, Limitations, and Best-Effort Behavior

What is guaranteed, what is best-effort, and what can go wrong.

---

## Data Latency

| Data Type       | Latency              | Guaranteed? | Notes                                  |
| --------------- | -------------------- | ----------- | -------------------------------------- |
| Price alerts    | Up to 60 sec         | Best-effort | Polling, not streaming. Could miss fast reversals. |
| Pre-market movers | Depends on Polygon | Best-effort | Free tier is 15-min delayed. Finnhub IEX is real-time but partial. |
| News            | 1-5 min              | Best-effort | Depends on when Finnhub indexes the article. |
| Political news  | 1-10 min             | Best-effort | RSS feeds update at publisher's pace. Polled every 10 min. |
| Econ results    | 1-3 min after release | Best-effort | Finnhub publishes actuals within minutes, not seconds. |
| Earnings results | 2-15 min            | Best-effort | Finnhub may lag behind real-time sources. |
| Reddit sentiment | 15-30 min           | Best-effort | Polls hot posts periodically. Not real-time. |

**None of this is real-time in the strict sense.** For actual trading execution, use your broker's data, not Discord alerts. These bots are for awareness and planning, not for triggering trades at the millisecond level.

---

## API Reliability

| API       | Risk                                        | Mitigation                           |
| --------- | ------------------------------------------- | ------------------------------------ |
| Finnhub   | Rate limit (60/min), occasional outages     | Respect limits, retry, fallback to Polygon/yfinance |
| Polygon   | Rate limit (5/min free), 15-min delay on free | Use Finnhub as primary for prices    |
| yfinance  | Unofficial, can break when Yahoo changes backend | Use as fallback only, pin version |
| RSS feeds | Publishers can change feed URLs              | Monitor for 404s, log to #bot-logs   |
| Reddit    | Rate limit (100/min), API changes            | Conservative polling, handle errors  |

### When an API Is Down
- Function logs the error to Supabase `bot_log` and posts to `#bot-logs`
- Inngest retries the function (up to 3 times with backoff)
- If still failing, that module's posts stop until the API recovers
- Other modules are unaffected (each function is independent)

---

## Serverless Limitations

| Limitation                    | Impact                                    | Workaround                          |
| ----------------------------- | ----------------------------------------- | ----------------------------------- |
| No persistent WebSocket       | Can't stream real-time prices             | Poll every 1 min via Inngest        |
| No persistent Discord gateway | Bot won't show as "online"                | Cloudflare Worker heartbeat (Phase 2) |
| Vercel function timeout       | 10 sec on Hobby, 60 sec on Pro            | Keep functions fast. Split if needed. |
| Cold starts                   | First request after idle may be slow       | Unlikely to matter for cron jobs    |
| No shared memory between runs | Can't cache prices across function calls   | Use Supabase for all state          |

---

## Rate Limits (Discord)

| Action                  | Limit                              |
| ----------------------- | ---------------------------------- |
| Webhook messages        | 5 per second per webhook           |
| Slash command responses | Must respond within 3 seconds      |
| Embeds per message      | 10 max                             |
| Embed field count       | 25 max                             |

If a module tries to post too many messages at once (e.g., 20 news articles), batch them or add delays.

---

## Rate Limits (APIs)

| API       | Free Tier Limit        | What Happens If Exceeded              |
| --------- | ---------------------- | ------------------------------------- |
| Finnhub   | 60 calls/min           | 429 response. Retry after 60 sec.     |
| Polygon   | 5 calls/min            | 429 response. Retry after 60 sec.     |
| Reddit    | 100 calls/min (OAuth)  | 429 response. Retry after backoff.    |

### Budget per Cycle

With all modules running during market hours:
- **Finnhub:** ~20 calls per 5-min cycle (news for 15-20 tickers) + 1 call for econ + 1 for earnings = ~22 calls. At 60/min limit, this is fine.
- **Polygon:** 2-3 calls per 30-min cycle (gainers, losers, snapshot). At 5/min limit, this is fine.
- **Reddit:** 2-3 calls per 30-min cycle. At 100/min limit, this is fine.

If the watchlist grows past ~50 tickers, Finnhub calls per cycle increase. Solutions: batch tickers, increase poll interval, or upgrade Finnhub.

---

## What "Best Effort" Means

These bots are **informational tools, not trading signals**:

- A price alert firing 45 seconds late is normal, not a bug
- A news article posted 5 minutes after publication is normal
- An earnings result showing up 10 minutes after the call is normal
- Missing a post because an API was down for 2 minutes is normal

Design your trading decisions around your broker's tools. Use these bots for awareness: "something is happening with NVDA" → then check your broker for real-time data.

---

## Data Accuracy

| Risk                            | Likelihood | Impact                            |
| ------------------------------- | ---------- | --------------------------------- |
| Finnhub IEX price differs from consolidated tape | Common (few cents) | Low — directional accuracy is fine |
| Earnings EPS/revenue from Finnhub differs from official filing | Rare | Medium — usually reconciles within hours |
| News headline misclassified as market-relevant | Occasional | Low — worst case is a noisy post |
| Political news misclassified as market-relevant | Occasional | Low — filtering is conservative |
| Short interest data is stale (bi-monthly updates) | Always | Medium — clearly label the data date |

---

## Phase 2 Upgrades That Address Limitations

| Limitation              | Phase 2 Fix                                    | Effort |
| ----------------------- | ---------------------------------------------- | ------ |
| 60-sec alert latency    | Cloudflare Durable Object holding Finnhub WebSocket | Medium |
| Bot appears offline     | Cloudflare Worker with Discord gateway heartbeat | Low    |
| 15-min delayed prices   | Polygon Starter plan ($29/mo)                  | Low    |
| No options flow         | Polygon Starter or Unusual Whales              | Low    |
| Basic sentiment         | LLM-powered headline summarization             | Medium |
