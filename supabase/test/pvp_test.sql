\set ON_ERROR_STOP 1
-- server (service role) sets up a match; players can only see their pings
insert into public.pvp_profiles (user_id, name, rating) values ('11111111-1111-1111-1111-111111111111', 'A', 1000), ('22222222-2222-2222-2222-222222222222', 'B', 1200), ('33333333-3333-3333-3333-333333333333', 'C', 1010);
insert into public.pvp_queue (user_id, name, rating, deck) values ('22222222-2222-2222-2222-222222222222', 'B', 1200, '[]'), ('33333333-3333-3333-3333-333333333333', 'C', 1010, '[]');
-- A (1000) is paired with C (1010, closest rating), not B
select user_id = '33333333-3333-3333-3333-333333333333' as closest from public.pvp_claim_partner('11111111-1111-1111-1111-111111111111', 1000, gen_random_uuid());
-- C is taken now; the next search gets B
select user_id = '22222222-2222-2222-2222-222222222222' as next from public.pvp_claim_partner('11111111-1111-1111-1111-111111111111', 1000, gen_random_uuid());
select count(*) = 0 as none_left from public.pvp_claim_partner('11111111-1111-1111-1111-111111111111', 1000, gen_random_uuid());
insert into public.pvp_matches (id, a, b, data) values ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '{"secret": "hands"}');
insert into public.pvp_pings (match_id, a, b, status) values ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'live');
-- as player A
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select count(*) = 0 as matches_hidden from public.pvp_matches;
select count(*) = 1 as sees_own_ping from public.pvp_pings;
select count(*) = 3 as leaderboard_public from public.pvp_profiles;
select count(*) = 0 as others_queue_hidden from public.pvp_queue;
do $$ begin perform public.pvp_claim_partner('11111111-1111-1111-1111-111111111111', 1000, gen_random_uuid()); raise exception 'players must not pair themselves'; exception when insufficient_privilege then null; end $$;
do $$ begin update public.pvp_profiles set rating = 9999; if exists (select 1 from public.pvp_profiles where rating = 9999) then raise exception 'rating writable'; end if; end $$;
-- as C, a stranger to the match
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select count(*) = 0 as stranger_no_ping from public.pvp_pings;
reset role;
select 'pvp sql ok' as result;
