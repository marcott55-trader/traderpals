-- TraderPals schema hardening
-- Adds guard rails that match the current application behavior.

-- ── Cleanup existing data before adding constraints ────────────────

-- Normalize watchlist tiers if any legacy/invalid values slipped in.
update watchlist
set tier = 'custom'
where tier is null
   or tier not in ('tier1', 'tier2', 'futures', 'custom');

-- Backfill alert defaults so NOT NULL / uniqueness checks are safe.
update price_alerts
set active = true
where active is null;

update price_alerts
set created_at = now()
where created_at is null;

-- Keep only the newest copy of any duplicate active alert.
with ranked as (
  select
    id,
    row_number() over (
      partition by discord_user_id, ticker, alert_type,
        coalesce(level, -1), coalesce(ma_period, -1)
      order by created_at desc, id desc
    ) as rn
  from price_alerts
  where active = true
)
delete from price_alerts
where id in (
  select id
  from ranked
  where rn > 1
);

-- ── Watchlist constraints ──────────────────────────────────────────

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'watchlist_tier_check'
  ) then
    alter table watchlist
      add constraint watchlist_tier_check
      check (tier in ('tier1', 'tier2', 'futures', 'custom'));
  end if;
end $$;

-- ── Price alert constraints ────────────────────────────────────────

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'price_alerts_alert_type_check'
  ) then
    alter table price_alerts
      add constraint price_alerts_alert_type_check
      check (alert_type in ('above', 'below', 'ma_cross', 'vwap', 'pct_move'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'price_alerts_ma_period_check'
  ) then
    alter table price_alerts
      add constraint price_alerts_ma_period_check
      check (
        ma_period is null
        or ma_period in (9, 20, 50, 100, 200)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'price_alerts_level_shape_check'
  ) then
    alter table price_alerts
      add constraint price_alerts_level_shape_check
      check (
        (
          alert_type in ('above', 'below', 'pct_move')
          and level is not null
          and ma_period is null
        )
        or (
          alert_type = 'ma_cross'
          and level is null
          and ma_period is not null
        )
        or (
          alert_type = 'vwap'
          and level is null
          and ma_period is null
        )
      );
  end if;
end $$;

alter table price_alerts
  alter column active set not null;

alter table price_alerts
  alter column created_at set not null;

create unique index if not exists idx_price_alerts_unique_active
  on price_alerts (
    discord_user_id,
    ticker,
    alert_type,
    coalesce(level, -1),
    coalesce(ma_period, -1)
  )
  where active = true;
