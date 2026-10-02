-- THRENYX tournaments (Oktoberfest 2026 first): the scoreboard, and a
-- separate matchmaking pool for the finals. Run once in the Supabase SQL
-- editor, after pvp.sql (safe to run again). Only the `pvp` Edge Function
-- writes scores; everyone can read them (the leaderboard).

create table if not exists public.event_entries (
  event text not null,
  user_id uuid not null references auth.users on delete cascade,
  name text not null default 'Player',
  points integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  matches integer not null default 0,
  rating integer not null default 1000, -- finals
  extra jsonb not null default '{}'::jsonb, -- daily caps
  updated_at timestamptz not null default now(),
  primary key (event, user_id)
);
alter table public.event_entries enable row level security;
drop policy if exists "event entries: read" on public.event_entries;
create policy "event entries: read" on public.event_entries for select using (true);
create index if not exists event_entries_board on public.event_entries (event, points desc, wins desc, updated_at);

-- Finalists queue in their own pool, so they only meet each other.
alter table public.pvp_queue add column if not exists pool text not null default 'ranked';

-- Matchmaking, now within a pool (replaces the version in pvp.sql).
drop function if exists public.pvp_claim_partner(uuid, integer, uuid);
create or replace function public.pvp_claim_partner(p_user uuid, p_rating integer, p_match uuid, p_pool text default 'ranked')
returns setof public.pvp_queue
language sql security definer set search_path = public as $$
  update public.pvp_queue set match_id = p_match
  where user_id = (
    select user_id from public.pvp_queue
    where user_id <> p_user and match_id is null and pool = p_pool
    order by abs(rating - p_rating), created_at
    limit 1
    for update skip locked
  )
  returning *;
$$;
revoke all on function public.pvp_claim_partner(uuid, integer, uuid, text) from public, anon, authenticated;
