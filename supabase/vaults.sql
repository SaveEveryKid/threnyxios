-- THRENYX vaults: each signed-in player's collection, currencies and reward
-- bookkeeping, owned by the server. Players can read their own vault but never
-- write it: every change goes through the `economy` Edge Function, which runs
-- the game's own rules (engine/economy.js). Run once in the Supabase SQL editor
-- (safe to run again). Needs purchases.sql and alliances.sql first.

create table if not exists public.vaults (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.vaults enable row level security;
drop policy if exists "vaults: read own" on public.vaults;
create policy "vaults: read own" on public.vaults for select using (auth.uid() = user_id);
-- no insert / update / delete policies: only the server (service role) writes

-- Purchases are now collected by the server straight into the vault, so the
-- game can no longer mark them claimed itself (an old copy of the game doing
-- that would lose the purchase).
revoke execute on function public.claim_purchases() from authenticated, anon, public;
