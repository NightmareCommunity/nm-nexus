-- Drop OLD community_members policies that were causing infinite recursion.
-- These were created by the original 0003 migration and have self-referencing subqueries.

drop policy if exists com_members_select_member on public.community_members;
drop policy if exists com_members_insert_self on public.community_members;
drop policy if exists com_members_update_admin on public.community_members;
drop policy if exists com_members_delete_self_or_admin on public.community_members;

-- Also check for old policies on other tables that might cause recursion
-- channels
drop policy if exists channels_select on public.channels;
drop policy if exists channels_insert on public.channels;
drop policy if exists channels_update on public.channels;
drop policy if exists channels_delete on public.channels;

-- communities
drop policy if exists communities_select on public.communities;
drop policy if exists communities_insert on public.communities;
drop policy if exists communities_update on public.communities;
drop policy if exists communities_delete on public.communities;

-- conversations
drop policy if exists conversations_select on public.conversations;
drop policy if exists conversations_insert on public.conversations;
drop policy if exists conversations_update on public.conversations;
drop policy if exists conversations_delete on public.conversations;

-- conversation_members
drop policy if exists conv_members_select on public.conversation_members;
drop policy if exists conv_members_insert on public.conversation_members;
drop policy if exists conv_members_update on public.conversation_members;
drop policy if exists conv_members_delete on public.conversation_members;

-- messages
drop policy if exists messages_select on public.messages;
drop policy if exists messages_insert on public.messages;
drop policy if exists messages_update on public.messages;
drop policy if exists messages_delete on public.messages;

-- channel_messages
drop policy if exists channel_messages_select on public.channel_messages;
drop policy if exists channel_messages_insert on public.channel_messages;
drop policy if exists channel_messages_update on public.channel_messages;
drop policy if exists channel_messages_delete on public.channel_messages;

-- friendships
drop policy if exists friendships_select on public.friendships;
drop policy if exists friendships_insert on public.friendships;
drop policy if exists friendships_update on public.friendships;
drop policy if exists friendships_delete on public.friendships;

-- blocks
drop policy if exists blocks_select on public.blocks;
drop policy if exists blocks_insert on public.blocks;
drop policy if exists blocks_delete on public.blocks;

-- Verify: list all remaining policies on community_members
-- (should only be: community_members_select, community_members_insert_self,
--  community_members_update_self_admin, community_members_delete)
