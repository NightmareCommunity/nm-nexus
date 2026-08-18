-- Fix RLS recursion on community_members by using a security definer function.

create or replace function public.is_community_member(p_community_id uuid)
returns boolean
language sql
security definer
as $func$
  select exists (
    select 1 from public.community_members cm
    where cm.community_id = p_community_id and cm.user_id = auth.uid()
  );
$func$;

-- Also helper for "is admin or higher"
create or replace function public.is_community_admin(p_community_id uuid)
returns boolean
language sql
security definer
as $func$
  select exists (
    select 1 from public.community_members cm
    where cm.community_id = p_community_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner', 'admin')
  );
$func$;

create or replace function public.is_community_moderator(p_community_id uuid)
returns boolean
language sql
security definer
as $func$
  select exists (
    select 1 from public.community_members cm
    where cm.community_id = p_community_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner', 'admin', 'moderator')
  );
$func$;

-- Re-grant execute
grant execute on function public.is_community_member(uuid) to anon, authenticated;
grant execute on function public.is_community_admin(uuid) to anon, authenticated;
grant execute on function public.is_community_moderator(uuid) to anon, authenticated;

-- Drop and recreate community_members policies using the helper
drop policy if exists community_members_select on public.community_members;
create policy community_members_select on public.community_members
  for select using (
    user_id = auth.uid()
    or public.is_community_member(community_id)
    or exists (
      select 1 from public.communities c
      where c.id = community_members.community_id and c.is_public = true
    )
  );

drop policy if exists community_members_insert_self on public.community_members;
create policy community_members_insert_self on public.community_members
  for insert with check (user_id = auth.uid());

drop policy if exists community_members_update_self_admin on public.community_members;
create policy community_members_update_self_admin on public.community_members
  for update using (
    user_id = auth.uid()
    or public.is_community_admin(community_id)
  )
  with check (
    user_id = auth.uid()
    or public.is_community_admin(community_id)
  );

drop policy if exists community_members_delete on public.community_members;
create policy community_members_delete on public.community_members
  for delete using (
    user_id = auth.uid()
    or public.is_community_moderator(community_id)
  );

-- Also update channels + channel_messages policies to use the helper (avoids self-join recursion)
drop policy if exists channels_select_member on public.channels;
create policy channels_select_member on public.channels
  for select using (public.is_community_member(community_id));

drop policy if exists channels_insert_admin on public.channels;
create policy channels_insert_admin on public.channels
  for insert with check (public.is_community_moderator(community_id));

drop policy if exists channels_update_admin on public.channels;
create policy channels_update_admin on public.channels
  for update using (public.is_community_moderator(community_id));

drop policy if exists channels_delete_admin on public.channels;
create policy channels_delete_admin on public.channels
  for delete using (public.is_community_admin(community_id));

drop policy if exists channel_messages_select_member on public.channel_messages;
create policy channel_messages_select_member on public.channel_messages
  for select using (
    exists (
      select 1 from public.channels c
      where c.id = channel_messages.channel_id
        and public.is_community_member(c.community_id)
    )
  );

drop policy if exists channel_messages_insert_member on public.channel_messages;
create policy channel_messages_insert_member on public.channel_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.channels c
      where c.id = channel_messages.channel_id
        and public.is_community_member(c.community_id)
    )
  );

drop policy if exists channel_messages_update_sender on public.channel_messages;
create policy channel_messages_update_sender on public.channel_messages
  for update using (
    sender_id = auth.uid()
    or exists (
      select 1 from public.channels c
      where c.id = channel_messages.channel_id
        and public.is_community_moderator(c.community_id)
    )
  );

drop policy if exists channel_messages_delete_sender on public.channel_messages;
create policy channel_messages_delete_sender on public.channel_messages
  for delete using (
    sender_id = auth.uid()
    or exists (
      select 1 from public.channels c
      where c.id = channel_messages.channel_id
        and public.is_community_moderator(c.community_id)
    )
  );

-- channel_categories
drop policy if exists channel_categories_select on public.channel_categories;
create policy channel_categories_select on public.channel_categories
  for select using (public.is_community_member(community_id));

drop policy if exists channel_categories_insert on public.channel_categories;
create policy channel_categories_insert on public.channel_categories
  for insert with check (public.is_community_admin(community_id));

drop policy if exists channel_categories_update on public.channel_categories;
create policy channel_categories_update on public.channel_categories
  for update using (public.is_community_admin(community_id));

drop policy if exists channel_categories_delete on public.channel_categories;
create policy channel_categories_delete on public.channel_categories
  for delete using (public.is_community_admin(community_id));

-- voice_states (use helper instead of self-join)
drop policy if exists voice_states_select on public.voice_states;
create policy voice_states_select on public.voice_states
  for select using (
    user_id = auth.uid()
    or public.is_community_member(community_id)
  );

-- pinned_messages
drop policy if exists pinned_messages_select on public.pinned_messages;
create policy pinned_messages_select on public.pinned_messages
  for select using (
    exists (
      select 1 from public.channels c
      where c.id = pinned_messages.channel_id
        and public.is_community_member(c.community_id)
    )
  );

drop policy if exists pinned_messages_insert on public.pinned_messages;
create policy pinned_messages_insert on public.pinned_messages
  for insert with check (
    pinned_by = auth.uid()
    and exists (
      select 1 from public.channels c
      where c.id = pinned_messages.channel_id
        and public.is_community_moderator(c.community_id)
    )
  );

drop policy if exists pinned_messages_delete on public.pinned_messages;
create policy pinned_messages_delete on public.pinned_messages
  for delete using (
    pinned_by = auth.uid()
    or exists (
      select 1 from public.channels c
      where c.id = pinned_messages.channel_id
        and public.is_community_moderator(c.community_id)
    )
  );

-- message_edits
drop policy if exists message_edits_select on public.message_edits;
create policy message_edits_select on public.message_edits
  for select using (
    exists (
      select 1 from public.channel_messages m
      join public.channels c on c.id = m.channel_id
      where m.id = message_edits.message_id
        and public.is_community_member(c.community_id)
    )
    or exists (
      select 1 from public.messages m
      join public.conversation_members convm on convm.conversation_id = m.conversation_id
      where m.id = message_edits.conversation_message_id and convm.user_id = auth.uid()
    )
  );
