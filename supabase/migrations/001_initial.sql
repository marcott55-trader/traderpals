-- TraderPals initial schema
-- Run this in Supabase SQL Editor or via `supabase db push`

-- Watchlist: tickers the group tracks
create table if not exists watchlist (
  ticker text primary key,
  tier text not null default 'custom',
  added_by text,
  added_at timestamptz default now()
);

-- Price alerts: user-set alerts via /alert commands
create table if not exists price_alerts (
  id bigint generated always as identity primary key,
  ticker text not null,
  alert_type text not null,
  level numeric,
  ma_period int,
  discord_user_id text not null,
  discord_username text,
  active boolean default true,
  triggered_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_alerts_active on price_alerts (active) where active = true;
create index if not exists idx_alerts_ticker on price_alerts (ticker) where active = true;

-- Posted news: dedup for news and political posts
create table if not exists posted_news (
  news_id text primary key,
  ticker text,
  category text not null,
  channel text not null,
  headline text,
  posted_at timestamptz default now()
);

-- Posted earnings: dedup for earnings results
create table if not exists posted_earnings (
  ticker text not null,
  report_date date not null,
  result_posted boolean default false,
  posted_at timestamptz default now(),
  primary key (ticker, report_date)
);

-- Economic events: cached daily from Finnhub
create table if not exists econ_events (
  id bigint generated always as identity primary key,
  event_date date not null,
  event_time time,
  event_name text not null,
  country text default 'US',
  impact text,
  forecast text,
  previous text,
  actual text,
  is_fed_speech boolean default false,
  speaker_name text,
  is_voting_member boolean,
  alert_sent boolean default false,
  result_posted boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_econ_date on econ_events (event_date);

-- Bot log: activity and error tracking
create table if not exists bot_log (
  id bigint generated always as identity primary key,
  module text not null,
  action text not null,
  details jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_log_module on bot_log (module, created_at desc);

-- Seed default watchlist
insert into watchlist (ticker, tier) values
  ('AAPL', 'tier1'), ('MSFT', 'tier1'), ('NVDA', 'tier1'),
  ('TSLA', 'tier1'), ('AMZN', 'tier1'), ('META', 'tier1'),
  ('GOOGL', 'tier1'), ('SPY', 'tier1'), ('QQQ', 'tier1'),
  ('AMD', 'tier2'), ('NFLX', 'tier2'), ('CRM', 'tier2'),
  ('COIN', 'tier2'), ('PLTR', 'tier2'), ('SOFI', 'tier2')
on conflict (ticker) do nothing;
