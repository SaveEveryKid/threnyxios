-- THRENYX friends and trading (docs/19-friends-trading.md). Run once in the
-- Supabase SQL editor; safe to run again. Every table is server-only (row level
-- security on, no policies): the economy function does all the reading and
-- writing, with the rules in engine/social.js.

-- Blocks (also made by voice.sql): either direction ends friendship, messages and trades.
create table if not exists public.player_blocks (
  blocker uuid not null references auth.users on delete cascade,
  blocked uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.player_blocks enable row level security;

-- Each player's friend code (shared off the game, like a phone number for THRENYX).
-- `allow` is who may send this player a friend request: 'anyone' (code or played
-- together), 'played' (only people they've played), 'none' (nobody new).
create table if not exists public.friend_codes (
  user_id uuid primary key references auth.users on delete cascade,
  code text not null unique,
  allow text not null default 'anyone' check (allow in ('anyone', 'played', 'none')),
  created_at timestamptz not null default now()
);
alter table public.friend_codes add column if not exists allow text not null default 'anyone' check (allow in ('anyone', 'played', 'none'));
alter table public.friend_codes enable row level security;

-- Friendships, one row per direction: (me, them, 'outgoing') + (them, me, 'incoming')
-- while a request waits, then both 'friends'. A declined request leaves only the
-- asker's row, as 'declined', so they can't ask again for a week.
create table if not exists public.friends (
  user_id uuid not null references auth.users on delete cascade,
  friend_id uuid not null references auth.users on delete cascade,
  status text not null check (status in ('outgoing', 'incoming', 'friends', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
alter table public.friends enable row level security;
create index if not exists friends_by_friend on public.friends (friend_id);

-- Messages between friends: only the id of a preset message is stored (never
-- typed text), plus a Duel challenge code for "Wanna Duel?".
create table if not exists public.friend_messages (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references auth.users on delete cascade,
  to_id uuid not null references auth.users on delete cascade,
  preset text not null check (preset ~ '^[a-z]{1,12}$'),
  code text check (code is null or code ~ '^[A-Z0-9]{6}$'),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.friend_messages enable row level security;
create index if not exists friend_messages_to on public.friend_messages (to_id, created_at desc);
create index if not exists friend_messages_from on public.friend_messages (from_id, created_at desc);

-- Trade offers: who gives what (copy tags), never edited once sent.
create table if not exists public.trade_offers (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references auth.users on delete cascade,
  to_id uuid not null references auth.users on delete cascade,
  give jsonb not null default '[]',   -- the sender's copies [{copyId, cardId, treatment}]
  get jsonb not null default '[]',    -- the receiver's copies
  listing_id uuid,                    -- an offer on a Trade Board post
  counter_of uuid,                    -- a counter-offer: the offer it answers
  seal integer not null default 0,
  status text not null default 'open' check (status in ('open', 'done', 'declined', 'countered', 'cancelled', 'expired', 'failed')),
  reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
-- (for a database that ran an earlier version of this file)
alter table public.trade_offers add column if not exists counter_of uuid;
alter table public.trade_offers drop constraint if exists trade_offers_status_check;
alter table public.trade_offers add constraint trade_offers_status_check check (status in ('open', 'done', 'declined', 'countered', 'cancelled', 'expired', 'failed'));
alter table public.trade_offers enable row level security;
create index if not exists trade_offers_to on public.trade_offers (to_id, status);
create index if not exists trade_offers_from on public.trade_offers (from_id, status);

-- The Trade Board: "Have these, want those" posts anyone (who can trade) can take.
create table if not exists public.trade_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null default 'Player',
  have jsonb not null,                -- the poster's copies [{copyId, cardId, treatment}]
  want jsonb not null default '[]',   -- card ids; empty means "make me an offer"
  cards text not null default '',     -- card ids in the post, for searching
  status text not null default 'open' check (status in ('open', 'done', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
alter table public.trade_listings enable row level security;
create index if not exists trade_listings_open on public.trade_listings (status, created_at desc);
create index if not exists trade_listings_user on public.trade_listings (user_id, status);

-- Every completed trade (the daily limit, support questions, abuse checks).
create table if not exists public.trade_log (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references auth.users on delete cascade,
  b uuid not null references auth.users on delete cascade,
  a_gave jsonb not null,
  b_gave jsonb not null,
  seal integer not null default 0,
  offer_id uuid,
  listing_id uuid,
  created_at timestamptz not null default now()
);
alter table public.trade_log enable row level security;
create index if not exists trade_log_a on public.trade_log (a, created_at desc);
create index if not exists trade_log_b on public.trade_log (b, created_at desc);

-- The swap: both vaults change together or neither does. Each update only goes
-- through if that vault hasn't changed since the server read it (its version);
-- otherwise nothing is written and the server reads again and retries.
create or replace function public.trade_swap(p_a uuid, p_a_ver integer, p_a_data jsonb, p_b uuid, p_b_ver integer, p_b_data jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update vaults set data = p_a_data, version = p_a_ver + 1, updated_at = now() where user_id = p_a and version = p_a_ver;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  update vaults set data = p_b_data, version = p_b_ver + 1, updated_at = now() where user_id = p_b and version = p_b_ver;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'trade_swap: vault changed'; end if;
  return true;
end $$;
revoke all on function public.trade_swap(uuid, integer, jsonb, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.trade_swap(uuid, integer, jsonb, uuid, integer, jsonb) to service_role;
