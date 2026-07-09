-- Make creator_earnings idempotent per order.
--
-- Stripe retries a webhook whenever delivery times out or the endpoint answers
-- non-2xx. The fulfilment path upserted the entitlement (unique on
-- (course_id, buyer_user_id)) but plain-inserted the earnings row, so a retry
-- credited the creator twice for one payment. Proven live in test mode: one
-- 2500ct purchase, replayed event, 2 rows, 4500ct net credited.
--
-- A unique index on order_id lets the handler upsert instead. Postgres treats
-- NULLs as distinct, so the pre-Phase-3 rows without an order_id stay legal.

-- Collapse any existing duplicates first, keeping one row per order.
delete from public.creator_earnings
where order_id is not null
  and ctid not in (
    select min(ctid) from public.creator_earnings where order_id is not null group by order_id
  );

create unique index if not exists creator_earnings_order_id_key
  on public.creator_earnings (order_id);
