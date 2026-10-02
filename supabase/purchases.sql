-- THRENYX purchases: written only by the Stripe webhook (service role),
-- read and claimed by the buyer. Run once in the Supabase SQL editor.
create table if not exists public.purchases (
  id text primary key,                         -- the Stripe Checkout session id (idempotent)
  user_id uuid not null references auth.users on delete cascade,
  product text not null,
  amount_cents integer not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
alter table public.purchases enable row level security;
drop policy if exists "own purchases: read" on public.purchases;
create policy "own purchases: read" on public.purchases for select using (auth.uid() = user_id);

-- The game calls this after sign-in: it marks the player's unclaimed
-- purchases as claimed and returns them, in one step, so each pays once.
create or replace function public.claim_purchases()
returns setof public.purchases
language sql security definer set search_path = public as $$
  update public.purchases set claimed_at = now()
  where user_id = auth.uid() and claimed_at is null
  returning *;
$$;
-- Only the server calls this now (the economy function collects purchases into
-- the player's vault): players can't run it, whichever order the SQL files ran in.
revoke execute on function public.claim_purchases() from authenticated, anon, public;
