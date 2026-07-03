-- Per-user Row Level Security. Replaces the permissive `using(true)` allow-all
-- policies now that Supabase Auth gates the app. Every data row gets an owner_id
-- (auth.users.id); policies restrict access to the owner.
--
-- ⚠️ APPLY ORDER (do NOT run blind — it will lock you out of existing rows):
--   1. Sign up / sign in once so your auth.users row exists.
--   2. Get your uid:  select id, email from auth.users;
--   3. Replace <YOUR-AUTH-UID> below with that uuid (backfills existing rows).
--   4. Then apply this migration.
--
-- Tables previously carried only workspace_id (project scope). owner_id adds the
-- user scope that real multi-user RLS needs.

do $$
declare
  t text;
  tables text[] := array[
    'moodboards','relationships','research','brand_identities',
    'ideation_creators','ideas','goals',
    'world_nodes','world_edges','pipeline_cards'
  ];
begin
  foreach t in array tables loop
    -- 1. add owner column (nullable first so the backfill can run)
    execute format('alter table if exists public.%I add column if not exists owner_id uuid references auth.users(id)', t);
    -- 2. backfill every existing row to the current single user
    execute format('update public.%I set owner_id = %L where owner_id is null', t, '<YOUR-AUTH-UID>');
    -- 3. enable RLS + swap the allow-all policy for per-user ones
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format($p$create policy "%1$s_owner_select" on public.%1$I for select using (auth.uid() = owner_id)$p$, t);
    execute format($p$create policy "%1$s_owner_write" on public.%1$I for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id)$p$, t);
  end loop;
end $$;

-- After this, the web client must set owner_id on every insert. Supabase can do
-- this automatically via a column default: alter table ... alter column owner_id
-- set default auth.uid();  (add per table once you confirm the app path.)
