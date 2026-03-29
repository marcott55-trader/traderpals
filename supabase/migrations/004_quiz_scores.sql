create table if not exists quiz_scores (
  id               bigint generated always as identity primary key,
  discord_user_id  text    not null,
  discord_username text    not null,
  score            int     not null check (score between 0 and 10),
  total            int     not null default 10,
  completed_at     timestamptz not null default now()
);

create index idx_quiz_scores_user on quiz_scores (discord_user_id);
create index idx_quiz_scores_date on quiz_scores (completed_at);
