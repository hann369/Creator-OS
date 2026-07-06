-- Course Maker (Phase 3 — monetization). Adds the access/ledger layer and CLOSES
-- the Phase-2 paywall gap: a published course's non-preview content is now readable
-- only by the owner or a buyer who holds an entitlement.
--
-- Money model = platform as Merchant of Record: ONE Stripe account (the platform's),
-- creators never integrate Stripe. Buyers pay the platform; `creator_earnings` is the
-- internal ledger of what each creator is owed. Paid entitlements are written ONLY by
-- the server (service role, in the Stripe webhook). FREE courses can be self-granted
-- by the buyer (RLS-guarded to price_cents = 0), so no server is needed for those.

-- ─── Entitlements: WHO may access WHICH course ────────────────────────────────
create table if not exists public.course_entitlements (
  id            text primary key,
  course_id     text not null references public.courses(id) on delete cascade,
  buyer_user_id uuid default auth.uid() references auth.users(id),
  buyer_email   text,
  source        text default 'purchase',   -- purchase | free | grant
  order_id      text,
  created_at    timestamptz default now(),
  unique (course_id, buyer_user_id)
);
create index if not exists course_entitlements_course_idx on public.course_entitlements (course_id);
create index if not exists course_entitlements_buyer_idx  on public.course_entitlements (buyer_user_id);
alter table public.course_entitlements enable row level security;
do $$ begin
  -- Buyer sees their own entitlements; a creator sees entitlements for their courses.
  create policy "entitlements_select" on public.course_entitlements for select to authenticated
    using (
      buyer_user_id = auth.uid()
      or exists (select 1 from public.courses c where c.id = course_entitlements.course_id and c.owner_id = auth.uid())
    );
exception when duplicate_object then null; end $$;
do $$ begin
  -- Self-grant is allowed ONLY for FREE, published courses (can't unlock paid content).
  create policy "entitlements_free_selfgrant" on public.course_entitlements for insert to authenticated
    with check (
      buyer_user_id = auth.uid()
      and source = 'free'
      and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published' and c.price_cents = 0)
    );
exception when duplicate_object then null; end $$;

-- ─── Orders: a record of each purchase attempt (written by the server) ─────────
create table if not exists public.orders (
  id                     text primary key,
  course_id              text references public.courses(id) on delete set null,
  buyer_user_id          uuid,
  buyer_email            text,
  amount_cents           integer,
  currency               text default 'eur',
  stripe_session_id      text,
  stripe_payment_intent  text,
  status                 text default 'pending',   -- pending | paid | refunded | failed
  created_at             timestamptz default now()
);
create index if not exists orders_course_idx on public.orders (course_id);
alter table public.orders enable row level security;
do $$ begin
  create policy "orders_select" on public.orders for select to authenticated
    using (
      buyer_user_id = auth.uid()
      or exists (select 1 from public.courses c where c.id = orders.course_id and c.owner_id = auth.uid())
    );
exception when duplicate_object then null; end $$;
-- No insert/update policy → only the service role (webhook) writes orders.

-- ─── Creator earnings: the in-house ledger (written by the server) ────────────
create table if not exists public.creator_earnings (
  id                 text primary key,
  owner_id           uuid references auth.users(id),   -- the creator owed the money
  course_id          text references public.courses(id) on delete set null,
  order_id           text,
  gross_cents        integer,
  platform_fee_cents integer,
  net_cents          integer,
  payout_id          text,
  created_at         timestamptz default now()
);
create index if not exists creator_earnings_owner_idx on public.creator_earnings (owner_id);
alter table public.creator_earnings enable row level security;
do $$ begin
  create policy "creator_earnings_owner_select" on public.creator_earnings for select to authenticated
    using (owner_id = auth.uid());
exception when duplicate_object then null; end $$;
-- No insert/update policy → only the service role (webhook) writes earnings.

-- ─── Paywall: gate non-preview BLOCKS behind preview-flag or entitlement ───────
-- (Chapters + page titles stay public as the course "curriculum"; only the actual
--  block content is gated. Owner keeps full access via the owner policy.)
drop policy if exists "course_blocks_public_read" on public.course_blocks;
do $$ begin
  create policy "course_blocks_gated_read" on public.course_blocks for select to anon, authenticated
    using (
      exists (select 1 from public.courses c where c.id = course_blocks.course_id and c.status = 'published')
      and (
        exists (select 1 from public.course_pages p where p.id = course_blocks.page_id and p.is_preview)
        or exists (select 1 from public.course_entitlements e where e.course_id = course_blocks.course_id and e.buyer_user_id = auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

-- ─── Paywall for media: sign-URLs only for preview media or entitled buyers ────
drop policy if exists "course_media_public_read" on storage.objects;
do $$ begin
  create policy "course_media_gated_read" on storage.objects for select to anon, authenticated
    using (
      bucket_id = 'course-media'
      and exists (
        select 1
        from public.course_blocks b
        join public.course_pages p on p.id = b.page_id
        join public.courses c on c.id = b.course_id
        where c.status = 'published'
          and b.content->>'path' = name
          and (
            p.is_preview
            or exists (select 1 from public.course_entitlements e where e.course_id = b.course_id and e.buyer_user_id = auth.uid())
          )
      )
    );
exception when duplicate_object then null; end $$;
