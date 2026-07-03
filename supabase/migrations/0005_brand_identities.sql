-- Brand identities (Step 4): the identity layer fed by moodboards. Rich fields
-- (colors, typography, voice, hooks, moodboardIds) live in `data` jsonb; the
-- EntityStore writes/reads `type: 'identity'` entities here.

create table if not exists public.brand_identities (
  id            text primary key,
  workspace_id  text not null default 'main-space',
  title         text,
  data          jsonb default '{}'::jsonb,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists brand_identities_workspace_idx on public.brand_identities (workspace_id);

alter table public.brand_identities enable row level security;

do $$ begin
  create policy "brand_identities_all" on public.brand_identities for all using (true) with check (true);
exception when duplicate_object then null; end $$;
