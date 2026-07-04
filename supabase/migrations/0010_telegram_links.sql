-- Telegram account linking for the Creator OS bot. One row per user: it holds the
-- pending one-time link code (set when the user clicks "Connect Telegram" in
-- Settings) and, once linked, the Telegram chat/user id the bot writes ideas for
-- and pushes the briefing to.
--
-- Writes happen from the API server (service role, bypasses RLS): the webhook
-- resolves a code → owner and stores the chat id; the connect endpoint sets the
-- code (and may adopt an id reused from the ecosystem). The owner can READ their
-- own link status from the browser under RLS.

create table if not exists public.telegram_links (
  owner_id          uuid primary key references auth.users(id),
  telegram_user_id  bigint,
  telegram_chat_id  bigint,
  telegram_username text,
  link_code         text,            -- pending one-time code, null once consumed
  code_expires_at   timestamptz,
  linked_at         timestamptz,     -- null until the link completes
  source            text,            -- 'creator_link' | 'ecosystem_reuse'
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- One Telegram account maps to at most one creator; one pending code is unique.
create unique index if not exists telegram_links_user_idx on public.telegram_links (telegram_user_id) where telegram_user_id is not null;
create unique index if not exists telegram_links_code_idx on public.telegram_links (link_code) where link_code is not null;

alter table public.telegram_links enable row level security;
do $$ begin
  create policy "telegram_links_owner_select" on public.telegram_links for select using (auth.uid() = owner_id);
  create policy "telegram_links_owner_write"  on public.telegram_links for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;
