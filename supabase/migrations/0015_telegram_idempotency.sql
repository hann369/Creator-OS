-- Create table for tracking processed telegram update_ids (Idempotency protection)
create table if not exists public.processed_telegram_updates (
  update_id    bigint primary key,
  processed_at timestamptz default now()
);

-- Enable RLS (Service role client bypasses RLS, normal users have no access)
alter table public.processed_telegram_updates enable row level security;
