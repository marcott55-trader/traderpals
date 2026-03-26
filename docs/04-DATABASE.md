# Database Schema (Supabase Postgres)

All persistent state lives in Supabase. No YAML files, no SQLite, no local config.

---

## Tables

### `watchlist` — Tickers the group tracks

```sql
create table watchlist (
  ticker text primary key,
  tier text not null default 'custom',    -- tier1, tier2, futures, custom
  added_by text,                          -- Discord user ID
  added_at timestamptz default now()
);

-- Default seed data
insert into watchlist (ticker, tier) values
  ('AAPL', 'tier1'), ('MSFT', 'tier1'), ('NVDA', 'tier1'),
  ('TSLA', 'tier1'), ('AMZN', 'tier1'), ('META', 'tier1'),
  ('GOOGL', 'tier1'), ('SPY', 'tier1'), ('QQQ', 'tier1'),
  ('AMD', 'tier2'), ('NFLX', 'tier2'), ('CRM', 'tier2'),
  ('COIN', 'tier2'), ('PLTR', 'tier2'), ('SOFI', 'tier2');
```

### `price_alerts` — User-set alerts

```sql
create table price_alerts (
  id bigint generated always as identity primary key,
  ticker text not null,
  alert_type text not null,               -- above, below, ma_cross, vwap, pct_move
  level numeric,                          -- price level (null for MA/VWAP)
  ma_period int,                          -- for ma_cross: 9, 20, 50, 100, 200
  discord_user_id text not null,
  discord_username text,
  active boolean default true,
  triggered_at timestamptz,
  created_at timestamptz default now()
);

create index idx_alerts_active on price_alerts (active) where active = true;
create index idx_alerts_ticker on price_alerts (ticker) where active = true;
```

### `posted_news` — Dedup for news and political posts

```sql
create table posted_news (
  news_id text primary key,               -- hash of headline + source
  ticker text,
  category text not null,                 -- company, macro, political
  channel text not null,                  -- news, politics
  headline text,
  posted_at timestamptz default now()
);

-- Auto-cleanup: delete entries older than 7 days
-- (run via Supabase pg_cron or a weekly Inngest function)
```

### `posted_earnings` — Dedup for earnings

```sql
create table posted_earnings (
  ticker text not null,
  report_date date not null,
  result_posted boolean default false,
  posted_at timestamptz default now(),
  primary key (ticker, report_date)
);
```

### `econ_events` — Today's economic calendar (cached daily)

```sql
create table econ_events (
  id bigint generated always as identity primary key,
  event_date date not null,
  event_time time,                        -- null if time unknown
  event_name text not null,
  country text default 'US',
  impact text,                            -- high, medium, low
  forecast text,
  previous text,
  actual text,                            -- null until released
  is_fed_speech boolean default false,
  speaker_name text,                      -- for Fed speeches
  is_voting_member boolean,               -- for Fed speeches
  alert_sent boolean default false,       -- 15-min pre-alert sent?
  result_posted boolean default false,    -- result drop posted?
  created_at timestamptz default now()
);

create index idx_econ_date on econ_events (event_date);
```

### `bot_log` — Activity and error log

```sql
create table bot_log (
  id bigint generated always as identity primary key,
  module text not null,                   -- market-movers, news, econ-calendar, etc.
  action text not null,                   -- posted, error, skipped, rate_limited
  details jsonb,                          -- flexible payload
  created_at timestamptz default now()
);

create index idx_log_module on bot_log (module, created_at desc);
```

---

## Environment Variables (Vercel)

These are **not** in the database. They're in Vercel's env var settings.

```
# Discord
DISCORD_WEBHOOK_PREMARKET=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_NEWS=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_POLITICS=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_ECON_CALENDAR=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_EARNINGS=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_ALERTS=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_FLOW=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_BOT_LOGS=https://discord.com/api/webhooks/...
DISCORD_APP_ID=...
DISCORD_PUBLIC_KEY=...              # For verifying slash command signatures
DISCORD_BOT_TOKEN=...              # For registering slash commands

# APIs
FINNHUB_API_KEY=...
POLYGON_API_KEY=...
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...      # Server-side only, never expose to client

# Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...
```
