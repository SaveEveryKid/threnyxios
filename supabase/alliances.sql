-- NOTE: Alliance chat was removed on 2 Oct 2026. After this file, run
-- alliance-chat-off.sql, which removes posting and reading messages.
-- THRENYX Alliances (docs/08 §7): up to 30 members, a Leader and up to 3
-- Officers, a chat, and a weekly chest every kind of player fills. Run once in
-- the Supabase SQL editor (after pvp.sql). Every change goes through the
-- functions below, which enforce the rules; players can only read.

create table if not exists public.alliances (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 24),
  motto text not null default '' check (char_length(motto) <= 80),
  faction text not null check (faction in ('crown', 'quiet', 'hour', 'margin', 'vigil')),
  leader uuid not null references auth.users,
  member_count integer not null default 1,
  created_at timestamptz not null default now()
);
create unique index if not exists alliances_name on public.alliances (lower(name));
alter table public.alliances enable row level security;
drop policy if exists "alliances: read" on public.alliances;
create policy "alliances: read" on public.alliances for select using (true);

create table if not exists public.alliance_members (
  user_id uuid primary key references auth.users on delete cascade, -- one Alliance at a time
  alliance_id uuid not null references public.alliances on delete cascade,
  role text not null default 'member' check (role in ('leader', 'officer', 'member')),
  name text not null,
  joined_at timestamptz not null default now()
);
create index if not exists alliance_members_by on public.alliance_members (alliance_id);
alter table public.alliance_members enable row level security;
drop policy if exists "members: read" on public.alliance_members;
create policy "members: read" on public.alliance_members for select using (true);

-- is the signed-in player in this Alliance? (used by the read rules)
create or replace function public.my_alliance() returns uuid
language sql stable security definer set search_path = public as $$
  select alliance_id from public.alliance_members where user_id = auth.uid();
$$;

create table if not exists public.alliance_messages (
  id bigserial primary key,
  alliance_id uuid not null references public.alliances on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists alliance_messages_by on public.alliance_messages (alliance_id, id desc);
alter table public.alliance_messages enable row level security;
drop policy if exists "messages: members read" on public.alliance_messages;
create policy "messages: members read" on public.alliance_messages for select using (alliance_id = public.my_alliance());

create table if not exists public.alliance_contrib (
  alliance_id uuid not null references public.alliances on delete cascade,
  week integer not null,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  day date not null default current_date,
  n integer not null default 0,
  points integer not null default 0,
  primary key (alliance_id, week, user_id, kind, day)
);
alter table public.alliance_contrib enable row level security;
drop policy if exists "contrib: members read" on public.alliance_contrib;
create policy "contrib: members read" on public.alliance_contrib for select using (alliance_id = public.my_alliance());

create table if not exists public.alliance_claims (
  alliance_id uuid not null,
  week integer not null,
  user_id uuid not null references auth.users on delete cascade,
  tier integer not null,
  primary key (alliance_id, week, user_id, tier)
);
alter table public.alliance_claims enable row level security;
drop policy if exists "claims: own" on public.alliance_claims;
create policy "claims: own" on public.alliance_claims for select using (user_id = auth.uid());

do $$ begin alter publication supabase_realtime add table public.alliance_messages; exception when duplicate_object then null; end $$;

-- ---- the rules ------------------------------------------------------------------
create or replace function public.alliance_week() returns integer language sql stable as $$
  select to_char(now() at time zone 'utc', 'IYYYIW')::integer;
$$;

create or replace function public.create_alliance(p_name text, p_motto text, p_faction text, p_player text)
returns public.alliances language plpgsql security definer set search_path = public as $$
declare a public.alliances;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from alliance_members where user_id = auth.uid()) then raise exception 'Leave your Alliance first.'; end if;
  if exists (select 1 from alliances where lower(name) = lower(trim(p_name))) then raise exception 'That name is taken.'; end if;
  insert into alliances (name, motto, faction, leader) values (trim(p_name), coalesce(trim(p_motto), ''), p_faction, auth.uid()) returning * into a;
  insert into alliance_members (user_id, alliance_id, role, name) values (auth.uid(), a.id, 'leader', coalesce(nullif(trim(p_player), ''), 'Player'));
  return a;
end $$;

create or replace function public.join_alliance(p_id uuid, p_player text)
returns public.alliances language plpgsql security definer set search_path = public as $$
declare a public.alliances;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from alliance_members where user_id = auth.uid()) then raise exception 'Leave your Alliance first.'; end if;
  select * into a from alliances where id = p_id for update;
  if not found then raise exception 'No such Alliance.'; end if;
  if a.member_count >= 30 then raise exception 'That Alliance is full (30).'; end if;
  insert into alliance_members (user_id, alliance_id, name) values (auth.uid(), p_id, coalesce(nullif(trim(p_player), ''), 'Player'));
  update alliances set member_count = member_count + 1 where id = p_id returning * into a;
  return a;
end $$;

create or replace function public.leave_alliance()
returns void language plpgsql security definer set search_path = public as $$
declare me public.alliance_members; heir uuid;
begin
  select * into me from alliance_members where user_id = auth.uid();
  if not found then return; end if;
  delete from alliance_members where user_id = me.user_id;
  update alliances set member_count = member_count - 1 where id = me.alliance_id;
  if me.role = 'leader' then
    -- the longest-serving Officer takes over, else the longest-serving member
    select user_id into heir from alliance_members where alliance_id = me.alliance_id
      order by (role = 'officer') desc, joined_at limit 1;
    if heir is null then delete from alliances where id = me.alliance_id;
    else
      update alliance_members set role = 'leader' where user_id = heir;
      update alliances set leader = heir where id = me.alliance_id;
    end if;
  end if;
end $$;

create or replace function public.set_alliance_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.alliance_members; them public.alliance_members;
begin
  select * into me from alliance_members where user_id = auth.uid();
  select * into them from alliance_members where user_id = p_user;
  if me.role is distinct from 'leader' then raise exception 'Only the Leader can change roles.'; end if;
  if them.alliance_id is distinct from me.alliance_id or p_user = auth.uid() then raise exception 'Not in your Alliance.'; end if;
  if p_role = 'officer' and (select count(*) from alliance_members where alliance_id = me.alliance_id and role = 'officer') >= 3 then raise exception 'Three Officers at most.'; end if;
  if p_role = 'leader' then
    update alliance_members set role = 'officer' where user_id = auth.uid();
    update alliances set leader = p_user where id = me.alliance_id;
  elsif p_role not in ('officer', 'member') then raise exception 'Unknown role.';
  end if;
  update alliance_members set role = p_role where user_id = p_user;
end $$;

create or replace function public.kick_alliance_member(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.alliance_members; them public.alliance_members;
begin
  select * into me from alliance_members where user_id = auth.uid();
  select * into them from alliance_members where user_id = p_user;
  if them.alliance_id is distinct from me.alliance_id or p_user = auth.uid() then raise exception 'Not in your Alliance.'; end if;
  if not (me.role = 'leader' or (me.role = 'officer' and them.role = 'member')) then raise exception 'You can''t remove them.'; end if;
  delete from alliance_members where user_id = p_user;
  update alliances set member_count = member_count - 1 where id = me.alliance_id;
end $$;

create or replace function public.post_alliance_message(p_body text)
returns public.alliance_messages language plpgsql security definer set search_path = public as $$
declare me public.alliance_members; msg public.alliance_messages;
begin
  select * into me from alliance_members where user_id = auth.uid();
  if not found then raise exception 'Join an Alliance first.'; end if;
  if exists (select 1 from alliance_messages where user_id = auth.uid() and created_at > now() - interval '2 seconds') then raise exception 'Slow down a little.'; end if;
  insert into alliance_messages (alliance_id, user_id, name, body) values (me.alliance_id, auth.uid(), me.name, trim(p_body)) returning * into msg;
  return msg;
end $$;

-- The weekly chest. Points per kind of play, capped per day so every player type counts:
--   battle win 1 (10/day) · online win 2 (10/day) · Daily Read 3 (once) · Long Road clear 5 (once)
create or replace function public.alliance_contribute(p_kind text)
returns integer language plpgsql security definer set search_path = public as $$
declare me public.alliance_members; pts integer; cap integer; wk integer := public.alliance_week(); total integer;
begin
  select * into me from alliance_members where user_id = auth.uid();
  if not found then return null; end if;
  select v.pts, v.cap into pts, cap from (values ('battle', 1, 10), ('pvp', 2, 10), ('read', 3, 1), ('road', 5, 1)) as v(kind, pts, cap) where v.kind = p_kind;
  if pts is null then raise exception 'Unknown contribution.'; end if;
  insert into alliance_contrib (alliance_id, week, user_id, kind, n, points) values (me.alliance_id, wk, auth.uid(), p_kind, 1, pts)
  on conflict (alliance_id, week, user_id, kind, day) do update
    set n = alliance_contrib.n + 1,
        points = case when alliance_contrib.n < cap then alliance_contrib.points + pts else alliance_contrib.points end;
  select coalesce(sum(points), 0) into total from alliance_contrib where alliance_id = me.alliance_id and week = wk;
  return total;
end $$;

-- Chest tiers: 60 → 1 Standard Pack · 180 → 2 Standard Packs · 360 → a Faction Pack.
-- Everyone who helped this week can claim each tier reached, once.
create or replace function public.claim_alliance_chest(p_tier integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.alliance_members; wk integer := public.alliance_week(); total integer; need integer; reward jsonb;
begin
  select * into me from alliance_members where user_id = auth.uid();
  if not found then raise exception 'Join an Alliance first.'; end if;
  select v.need, v.reward into need, reward from (values (1, 60, '{"standard":1}'::jsonb), (2, 180, '{"standard":2}'::jsonb), (3, 360, '{"faction":1}'::jsonb)) as v(tier, need, reward) where v.tier = p_tier;
  if need is null then raise exception 'Unknown tier.'; end if;
  if not exists (select 1 from alliance_contrib where alliance_id = me.alliance_id and week = wk and user_id = auth.uid() and points > 0) then raise exception 'Help fill the chest this week to share it.'; end if;
  select coalesce(sum(points), 0) into total from alliance_contrib where alliance_id = me.alliance_id and week = wk;
  if total < need then raise exception 'The chest hasn''t reached that tier yet.'; end if;
  insert into alliance_claims (alliance_id, week, user_id, tier) values (me.alliance_id, wk, auth.uid(), p_tier)
  on conflict do nothing;
  if not found then raise exception 'Already claimed.'; end if;
  return reward;
end $$;

-- the chest as the player sees it
create or replace function public.alliance_chest()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me public.alliance_members; wk integer := public.alliance_week();
begin
  select * into me from alliance_members where user_id = auth.uid();
  if not found then return null; end if;
  return jsonb_build_object(
    'week', wk,
    'points', (select coalesce(sum(points), 0) from alliance_contrib where alliance_id = me.alliance_id and week = wk),
    'mine', (select coalesce(sum(points), 0) from alliance_contrib where alliance_id = me.alliance_id and week = wk and user_id = auth.uid()),
    'claimed', (select coalesce(jsonb_agg(tier), '[]'::jsonb) from alliance_claims where alliance_id = me.alliance_id and week = wk and user_id = auth.uid()),
    'top', (select coalesce(jsonb_agg(t order by t.points desc), '[]'::jsonb) from (select m.name, sum(c.points) as points from alliance_contrib c join alliance_members m using (user_id) where c.alliance_id = me.alliance_id and c.week = wk group by m.name) t)
  );
end $$;

revoke all on function public.create_alliance(text, text, text, text), public.join_alliance(uuid, text), public.leave_alliance(), public.set_alliance_role(uuid, text), public.kick_alliance_member(uuid), public.post_alliance_message(text), public.alliance_contribute(text), public.claim_alliance_chest(integer), public.alliance_chest() from public, anon;
grant execute on function public.create_alliance(text, text, text, text), public.join_alliance(uuid, text), public.leave_alliance(), public.set_alliance_role(uuid, text), public.kick_alliance_member(uuid), public.post_alliance_message(text), public.alliance_contribute(text), public.claim_alliance_chest(integer), public.alliance_chest() to authenticated;
