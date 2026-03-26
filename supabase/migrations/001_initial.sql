-- TraderPals Initial Schema
-- All persistent state for the bot system

-- ── Watchlist ───────────────────────────────────────────────────────

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

-- ── Price Alerts ────────────────────────────────────────────────────

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

-- ── Posted News (dedup) ─────────────────────────────────────────────

create table posted_news (
  news_id text primary key,               -- hash of headline + source
  ticker text,
  category text not null,                 -- company, macro, political
  channel text not null,                  -- news, politics
  headline text,
  posted_at timestamptz default now()
);

-- ── Posted Earnings (dedup) ─────────────────────────────────────────

create table posted_earnings (
  ticker text not null,
  report_date date not null,
  result_posted boolean default false,
  posted_at timestamptz default now(),
  primary key (ticker, report_date)
);

-- ── Economic Events (daily cache) ──────────────────────────────────

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

-- ── Bot Log ─────────────────────────────────────────────────────────

create table bot_log (
  id bigint generated always as identity primary key,
  module text not null,                   -- market-movers, news, econ-calendar, etc.
  action text not null,                   -- posted, error, skipped, rate_limited
  details jsonb,                          -- flexible payload
  created_at timestamptz default now()
);

create index idx_log_module on bot_log (module, created_at desc);

-- ── Bot Config (key-value settings) ─────────────────────────────────
-- Referenced by market-movers for configurable filters.

create table bot_config (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- Default movers config
insert into bot_config (key, value) values
  ('movers.min_change_pct', '0.5'),
  ('movers.min_price', '5'),
  ('movers.max_results', '10'),
  ('movers.min_volume', '0');

-- ── Cleanup: auto-delete old posted_news entries ────────────────────
-- Run via pg_cron if available, or an Inngest weekly function.
-- Example pg_cron (enable in Supabase dashboard → Extensions):
--
-- select cron.schedule(
--   'cleanup-posted-news',
--   '0 3 * * *',
--   $$delete from posted_news where posted_at < now() - interval '7 days'$$
-- );
