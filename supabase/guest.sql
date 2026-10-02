-- THRENYX guest play (docs/18-guest-play.md). Run once in the Supabase SQL
-- editor. Also switch on: Authentication → Sign In / Providers → "Allow
-- anonymous sign-ins". Guests are real (anonymous) users with their own vault.
-- Saving the profile gives that same user a username and password
-- (app_metadata.threnyx_account), so nothing is copied or lost.

-- Is the caller a guest? (anonymous and not yet saved)
create or replace function public.is_guest()
returns boolean language sql stable set search_path = public as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     and not coalesce((auth.jwt() -> 'app_metadata' ->> 'threnyx_account')::boolean, false);
$$;

-- Guests play friends, but stay off the leaderboard.
alter table public.pvp_profiles add column if not exists guest boolean not null default false;

-- The funnel: what happened and when, never who said what. A random visitor id
-- (made on the device, not a fingerprint), the player id once there is one.
create table if not exists public.funnel_events (
  id bigint generated always as identity primary key,
  visitor text,
  user_id uuid,
  name text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
alter table public.funnel_events enable row level security; -- server only
create index if not exists funnel_events_name on public.funnel_events (name, created_at);
create index if not exists funnel_events_visitor on public.funnel_events (visitor, created_at);

-- Guests can't post or join Alliances (supabase/text-filter.sql's create/join
-- check is_guest()). Old guest accounts that never played for 30 days can be
-- tidied from Authentication → Users (filter: anonymous).

-- The funnel at a glance (one row per day). More queries in docs/18-guest-play.md.
create or replace view public.funnel_daily as
select date_trunc('day', created_at) as day, name, count(*) as events, count(distinct coalesce(visitor, user_id::text)) as people
from public.funnel_events group by 1, 2 order by 1 desc, 3 desc;
revoke all on public.funnel_daily from anon, authenticated;
