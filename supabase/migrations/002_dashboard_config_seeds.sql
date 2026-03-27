-- Seed additional bot_config keys for the dashboard
-- Uses ON CONFLICT to avoid errors if keys already exist

insert into bot_config (key, value, description) values
  ('news.score_threshold', '40', 'Minimum score for a news article to be posted'),
  ('news.max_per_cycle', '3', 'Max articles posted per scan cycle'),
  ('news.lookback_minutes', '60', 'How far back to look for articles (minutes)'),
  ('politics.score_threshold', '15', 'Minimum score for political news to be posted'),
  ('politics.max_per_cycle', '2', 'Max political articles per scan cycle'),
  ('flow.min_short_pct', '25', 'Minimum short interest % to show a ticker'),
  ('flow.reddit_spike_threshold', '3', 'Reddit mention spike multiplier threshold'),
  ('flow.reddit_min_mentions', '10', 'Minimum Reddit mentions to consider')
on conflict (key) do nothing;
