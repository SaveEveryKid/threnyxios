\set ON_ERROR_STOP 1
insert into auth.users values ('44444444-4444-4444-4444-444444444444', 'd@x') on conflict do nothing;
set role authenticated;
-- A founds an Alliance
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select name = 'The Unrung' as created from public.create_alliance('The Unrung', 'We do not ring.', 'quiet', 'Ann');
do $$ begin perform public.create_alliance('Second', '', 'crown', 'Ann'); raise exception 'one alliance at a time'; exception when raise_exception then if sqlerrm not like 'Leave your%' then raise; end if; end $$;
-- B and C join; D tries a taken name
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select member_count = 2 as b_joined from public.join_alliance((select id from public.alliances limit 1), 'Bo');
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select member_count = 3 as c_joined from public.join_alliance((select id from public.alliances limit 1), 'Cy');
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$ begin perform public.create_alliance('the unrung', '', 'crown', 'Di'); raise exception 'names must be unique'; exception when raise_exception then if sqlerrm not like 'That name%' then raise; end if; end $$;
select count(*) = 0 as outsider_no_chat from public.alliance_messages;
-- roles: only the Leader promotes; an Officer can remove members but not other Officers
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin perform public.set_alliance_role('33333333-3333-3333-3333-333333333333', 'officer'); raise exception 'members cannot promote'; exception when raise_exception then if sqlerrm not like 'Only the Leader%' then raise; end if; end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.set_alliance_role('22222222-2222-2222-2222-222222222222', 'officer');
select role = 'officer' as bo_officer from public.alliance_members where user_id = '22222222-2222-2222-2222-222222222222';
-- chat: members read and post; rate limited
select body = 'Hello' as posted from public.post_alliance_message('Hello');
do $$ begin perform public.post_alliance_message('again'); raise exception 'rate limit'; exception when raise_exception then if sqlerrm not like 'Slow down%' then raise; end if; end $$;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select count(*) = 1 as member_reads_chat from public.alliance_messages;
-- the chest: capped contributions, claims once, only if you helped
select public.alliance_contribute('read') = 3 as read_counts;
select public.alliance_contribute('read') = 3 as read_capped_daily;
do $$ begin for i in 1..12 loop perform public.alliance_contribute('pvp'); end loop; end $$;
select (public.alliance_chest()->>'points')::int = 23 as pvp_capped_at_10;
do $$ begin perform public.claim_alliance_chest(1); raise exception 'tier not reached'; exception when raise_exception then if sqlerrm not like 'The chest hasn%' then raise; end if; end $$;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin for i in 1..10 loop perform public.alliance_contribute('pvp'); perform public.alliance_contribute('battle'); end loop; perform public.alliance_contribute('road'); end $$;
select (public.alliance_chest()->>'points')::int = 23 + 20 + 10 + 5 as points_58;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.alliance_contribute('battle') is not null and public.alliance_contribute('battle') is not null;
select (public.alliance_chest()->>'points')::int >= 60 as tier1_reached;
select public.claim_alliance_chest(1) = '{"standard":1}'::jsonb as claimed;
do $$ begin perform public.claim_alliance_chest(1); raise exception 'double claim'; exception when raise_exception then if sqlerrm not like 'Already%' then raise; end if; end $$;
-- an Officer removes a member; can't remove the Leader
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.kick_alliance_member('33333333-3333-3333-3333-333333333333');
do $$ begin perform public.kick_alliance_member('11111111-1111-1111-1111-111111111111'); raise exception 'officer kicked leader'; exception when raise_exception then if sqlerrm not like 'You can%' then raise; end if; end $$;
select member_count = 2 as two_left from public.alliances;
-- nobody can write tables directly
do $$ begin insert into public.alliance_members (user_id, alliance_id, name) values ('33333333-3333-3333-3333-333333333333', (select id from public.alliances limit 1), 'x'); raise exception 'direct insert allowed'; exception when insufficient_privilege then null; end $$;
-- the Leader leaves: the Officer takes over; the last one out closes the Alliance
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.leave_alliance();
select leader = '22222222-2222-2222-2222-222222222222' as officer_succeeds from public.alliances;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.leave_alliance();
select count(*) = 0 as closed from public.alliances;
reset role;
select 'alliances sql ok';
