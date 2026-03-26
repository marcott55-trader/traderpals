-- Bot configuration: tunable filters per module
-- Change these in the Supabase dashboard to control what gets posted

create table if not exists bot_config (
  key text primary key,
  value text not null,
  description text
);

-- Market Movers filter defaults
insert into bot_config (key, value, description) values
  ('movers.min_change_pct', '0.5', 'Minimum absolute % change to show a ticker'),
  ('movers.min_price', '5', 'Minimum stock price (skip penny stocks)'),
  ('movers.max_results', '10', 'Max gainers/losers to show per section'),
  ('movers.min_volume', '0', 'Minimum volume to show (0 = disabled until volume data added)')
on conflict (key) do nothing;
