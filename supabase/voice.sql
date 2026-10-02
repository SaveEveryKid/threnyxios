-- THRENYX live voice (docs/17-voice-chat.md). Run once in the Supabase SQL
-- editor, after pvp.sql and purchases.sql. Everything here is written only by
-- the `voice` Edge Function (service role). Players can read nothing but the
-- "something changed" ping of their own match and their own block list; age,
-- card and ID results never leave the server.

-- A refunded Season Pass stops giving Ranked Voice: set refunded_at on its row
-- (the purchase record itself stays, for the accounts).
alter table public.purchases add column if not exists refunded_at timestamptz;

-- One row per player: what the voice rules need, and nothing more.
-- band: the age band worked out from a declared birth month and year
-- (adult / teen / under13). The month and year themselves are not stored.
create table if not exists public.voice_accounts (
  user_id uuid primary key references auth.users on delete cascade,
  band text check (band in ('adult', 'teen', 'under13')),
  band_at timestamptz,
  card_ok boolean not null default false,       -- Stripe card check passed
  card_funding text,                            -- credit / debit / prepaid / unknown
  card_at timestamptz,
  card_session text,                            -- the pending Stripe Checkout (setup) session
  id_adult boolean not null default false,      -- Stripe Identity: verified 18+ (the date of birth is not kept)
  id_at timestamptz,
  id_session text,                              -- the pending Stripe Identity session
  friend_on boolean not null default false,     -- the player's own switches (off until they turn them on)
  ranked_on boolean not null default false,
  notice_version integer not null default 0,    -- the safety notice they accepted
  restricted_friend boolean not null default false, -- moderation
  restricted_ranked boolean not null default false,
  restricted_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.voice_accounts enable row level security; -- no policies: server only

-- Blocks: either direction stops voice and emotes between the two players.
create table if not exists public.player_blocks (
  blocker uuid not null references auth.users on delete cascade,
  blocked uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.player_blocks enable row level security;
drop policy if exists "blocks: read own" on public.player_blocks;
create policy "blocks: read own" on public.player_blocks for select using (auth.uid() = blocker);

-- Reports: reviewed by a person in the Supabase dashboard. No audio exists to attach.
create table if not exists public.player_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references auth.users on delete cascade,
  reported uuid not null references auth.users on delete cascade,
  match_id uuid,
  category text not null,
  note text check (char_length(note) <= 500),
  voice boolean not null default false,          -- were they in voice together
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);
alter table public.player_reports enable row level security; -- server only
create index if not exists player_reports_open on public.player_reports (status, created_at);

-- Who is in voice in which match, and their Cloudflare Realtime session.
-- id = '<match id>:<user id>'.
create table if not exists public.voice_sessions (
  id text primary key,
  match_id uuid not null,
  user_id uuid not null references auth.users on delete cascade,
  cf_session text,
  track text,                                   -- the published microphone track name
  mid text,                                     -- its transceiver
  pulled text,                                  -- the transceiver playing the other player
  mic boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.voice_sessions enable row level security; -- server only
create index if not exists voice_sessions_match on public.voice_sessions (match_id);

-- "Something changed in voice" for one match: the game listens and then asks
-- the server what changed. Holds no state worth reading.
create table if not exists public.voice_pings (
  match_id uuid primary key,
  a uuid not null,
  b uuid,
  seq integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.voice_pings enable row level security;
drop policy if exists "voice pings: players" on public.voice_pings;
create policy "voice pings: players" on public.voice_pings for select using (auth.uid() = a or auth.uid() = b);
do $$ begin
  alter publication supabase_realtime add table public.voice_pings;
exception when duplicate_object then null; end $$;

-- Product events: names and timings only, never audio or words. Kept 90 days.
create table if not exists public.voice_events (
  id bigint generated always as identity primary key,
  user_id uuid,
  match_id uuid,
  name text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
alter table public.voice_events enable row level security; -- server only
create index if not exists voice_events_user on public.voice_events (user_id, name, created_at);

-- Switches the server reads on every call: flip one in the dashboard and voice
-- follows within a minute, no redeploy.
create table if not exists public.app_flags (
  key text primary key,
  value boolean not null,
  updated_at timestamptz not null default now()
);
alter table public.app_flags enable row level security;
drop policy if exists "flags: read" on public.app_flags;
create policy "flags: read" on public.app_flags for select using (true);
insert into public.app_flags (key, value) values
  ('voiceSystemEnabled', true),
  ('friendVoiceEnabled', true),
  ('rankedVoiceEnabled', true),
  ('parentalVoiceControlsEnabled', false)
on conflict (key) do nothing;

-- Housekeeping, if pg_cron is on (Database → Extensions): old events and
-- finished voice sessions go after 90 days, closed reports after a year.
-- select cron.schedule('voice-tidy', '17 4 * * *', $$
--   delete from public.voice_events where created_at < now() - interval '90 days';
--   delete from public.voice_sessions where left_at < now() - interval '90 days';
--   delete from public.player_reports where status <> 'open' and created_at < now() - interval '365 days';
-- $$);
