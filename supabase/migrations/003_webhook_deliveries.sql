create table webhook_deliveries (
  id bigint generated always as identity primary key,
  provider text not null,
  topic text,
  event_id text not null,
  payload jsonb not null,
  headers jsonb,
  status text not null default 'received',
  error text,
  received_at timestamptz default now(),
  processed_at timestamptz
);

create unique index idx_webhook_deliveries_provider_event
  on webhook_deliveries (provider, event_id);

create index idx_webhook_deliveries_received_at
  on webhook_deliveries (received_at desc);
