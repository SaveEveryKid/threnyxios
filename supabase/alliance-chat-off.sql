-- THRENYX: Alliance chat is removed (2 Oct 2026: it couldn't be moderated for
-- children). Run once in the Supabase SQL editor, after alliances.sql.
-- Players can no longer post, read or receive Alliance messages, whatever
-- version of the game they have.

-- nobody can post
revoke execute on function public.post_alliance_message(text) from public, anon, authenticated;
drop function if exists public.post_alliance_message(text);

-- nobody can read the old messages
drop policy if exists "messages: members read" on public.alliance_messages;

-- nothing is sent live
do $$ begin
  alter publication supabase_realtime drop table public.alliance_messages;
exception when undefined_object or undefined_table then null; end $$;

-- The old messages are kept, unreadable, in case a report needs them. To
-- delete them for good instead, also run:
--   delete from public.alliance_messages;
