-- THRENYX PvP: profiles and ratings, the match queue, matches and the
-- "something changed" pings the game listens to. Run once in the Supabase SQL
-- editor. Matches hold hidden information (hands, draw order), so players can
-- never read them directly: only the `pvp` Edge Function (service role) does,
-- and it hands each player their own view.

create table if not exists public.pvp_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null default 'Player' check (char_length(name) between 1 and 18),
  rating integer not null default 1000,
  wins integer not null default 0,
  losses integer not null default 0,
  alliance_id uuid,
  updated_at timestamptz not null default now()
);
alter table public.pvp_profiles enable row level security;
-- names and ratings are public (the leaderboard); only the server writes
drop policy if exists "profiles: read" on public.pvp_profiles;
create policy "profiles: read" on public.pvp_profiles for select using (true);

create table if not exists public.pvp_queue (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null,
  rating integer not null,
  deck jsonb not null,
  created_at timestamptz not null default now(),
  match_id uuid
);
alter table public.pvp_queue enable row level security;
drop policy if exists "queue: read own" on public.pvp_queue;
create policy "queue: read own" on public.pvp_queue for select using (auth.uid() = user_id);

create table if not exists public.pvp_matches (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references auth.users on delete cascade,
  b uuid references auth.users on delete cascade,
  code text unique,
  status text not null default 'live' check (status in ('open', 'live', 'over')),
  data jsonb not null,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.pvp_matches enable row level security; -- no policies: server only
create index if not exists pvp_matches_players on public.pvp_matches (a, b, status);

create table if not exists public.pvp_pings (
  match_id uuid primary key references public.pvp_matches on delete cascade,
  a uuid not null,
  b uuid,
  version integer not null default 0,
  status text not null,
  updated_at timestamptz not null default now()
);
alter table public.pvp_pings enable row level security;
drop policy if exists "pings: players" on public.pvp_pings;
create policy "pings: players" on public.pvp_pings for select using (auth.uid() = a or auth.uid() = b);

-- The game listens for these rows changing (Supabase Realtime).
do $$ begin
  alter publication supabase_realtime add table public.pvp_pings;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.pvp_queue;
exception when duplicate_object then null; end $$;

-- Matchmaking: claim the waiting player closest in rating (oldest first on a
-- tie), atomically, so two searches can't grab the same opponent.
create or replace function public.pvp_claim_partner(p_user uuid, p_rating integer, p_match uuid)
returns setof public.pvp_queue
language sql security definer set search_path = public as $$
  update public.pvp_queue set match_id = p_match
  where user_id = (
    select user_id from public.pvp_queue
    where user_id <> p_user and match_id is null
    order by abs(rating - p_rating), created_at
    limit 1
    for update skip locked
  )
  returning *;
$$;
revoke all on function public.pvp_claim_partner(uuid, integer, uuid) from public, anon, authenticated;
