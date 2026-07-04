-- Per-user Row Level Security. Replaces the permissive `using(true)` allow-all
-- policies now that Supabase Auth gates the app. Every data row gets an owner_id
-- (default auth.uid()); policies restrict access to the owner.
--
-- The backfill_uid below is the current single user (hannesjantz@aol.com,
-- created 2026-07-04). Existing rows are assigned to them. `default auth.uid()`
-- means the existing client keeps inserting without code changes — the logged-in
-- user's JWT supplies owner_id automatically.
--
-- The API server uses the SERVICE ROLE key, which bypasses RLS, so its
-- world_nodes/pipeline_cards repos are unaffected. (If those API routes are ever
-- used to create rows, set owner_id explicitly there — service-role requests have
-- no auth.uid().)

do $$
declare
  t text;
  pol record;
  backfill_uid uuid := '1906f76f-a35c-4c13-8cf4-0b6298fdbf18';
  tables text[] := array[
    'moodboards','relationships','research','brand_identities',
    'ideation_creators','ideas','goals',
    'world_nodes','world_edges','pipeline_cards',
    'vault_items','northstar_entries'
  ];
begin
  foreach t in array tables loop
    -- 1. owner column with a default so client inserts keep working
    execute format('alter table public.%I add column if not exists owner_id uuid default auth.uid() references auth.users(id)', t);
    -- 2. backfill existing rows to the current single user
    execute format('update public.%I set owner_id = %L where owner_id is null', t, backfill_uid);
    -- 3. enable RLS
    execute format('alter table public.%I enable row level security', t);
    -- 4. drop every existing policy on the table (names vary across tables)
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
    -- 5. per-user policies
    execute format('create policy %I on public.%I for select using (auth.uid() = owner_id)', t || '_owner_select', t);
    execute format('create policy %I on public.%I for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id)', t || '_owner_write', t);
  end loop;
end $$;
