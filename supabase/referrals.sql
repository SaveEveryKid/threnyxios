-- THRENYX referrals: invite codes and who joined with whose. Run once in the
-- Supabase SQL editor (safe to run again). Only the `economy` Edge Function
-- reads or writes these (no policies: nobody can read them from the game).

create table if not exists public.ref_codes (
  user_id uuid primary key references auth.users on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);
alter table public.ref_codes enable row level security;

create table if not exists public.referrals (
  referred_id uuid primary key references auth.users on delete cascade, -- one inviter per player, ever
  referrer_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  counted_at timestamptz -- when they'd played enough to count
);
alter table public.referrals enable row level security;
create index if not exists referrals_by_referrer on public.referrals (referrer_id);
