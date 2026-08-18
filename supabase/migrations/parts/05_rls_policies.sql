-- RLS policies for new tables and additional policies for existing tables.
-- All policies are drop-if-exists + create, so safe to re-run.

-- ════════════════════════════════════════════════════════════════════
-- community_invites
-- ════════════════════════════════════════════════════════════════════
drop policy if exists community_invites_select on public.community_invites;
create policy community_invites_select on public.community_invites
  for select using (
    exists (
      select 1 from public.community_members cm
      where cm.community_id = community_invites.community_id and cm.user_id = auth.uid()
    )
    or (community_invites.revoked_at is null
        and (community_invites.expires_at is null or community_invites.expires_at > now()))
  );

drop policy if exists community_invites_insert on public.community_invites;
create policy community_invites_insert on public.community_invites
  for insert with check (
    exists (
      select 1 from public.community_members cm
      where cm.community_id = community_invites.community_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin', 'moderator')
    )
    and community_invites.created_by = auth.uid()
  );

drop policy if exists community_invites_update on public.community_invites;
create policy community_invites_update on public.community_invites
  for update using (
    community_invites.created_by = auth.uid()
    or exists (
      select 1 from public.community_members cm
      where cm.community_id = community_invites.community_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
  );

drop policy if exists community_invites_delete on public.community_invites;
create policy community_invites_delete on public.community_invites
  for delete using (
    community_invites.created_by = auth.uid()
    or exists (
      select 1 from public.community_members cm
      where cm.community_id = community_invites.community_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
  );

-- ════════════════════════════════════════════════════════════════════
-- read_states (owner-only)
-- ════════════════════════════════════════════════════════════════════
drop policy if exists read_states_select on public.read_states;
create policy read_states_select on public.read_states
  for select using (user_id = auth.uid());

drop policy if exists read_states_insert on public.read_states;
create policy read_states_insert on public.read_states
  for insert with check (user_id = auth.uid());

drop policy if exists read_states_update on public.read_states;
create policy read_states_update on public.read_states
  for update using (user_id = auth.uid());

drop policy if exists read_states_delete on public.read_states;
create policy read_states_delete on public.read_states
  for delete using (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════
-- voice_states
-- ════════════════════════════════════════════════════════════════════
drop policy if exists voice_states_select on public.voice_states;
create policy voice_states_select on public.voice_states
  for select using (
    exists (
      select 1 from public.community_members cm
      where cm.community_id = voice_states.community_id and cm.user_id = auth.uid()
    )
    or voice_states.user_id = auth.uid()
  );

drop policy if exists voice_states_insert on public.voice_states;
create policy voice_states_insert on public.voice_states
  for insert with check (user_id = auth.uid());

drop policy if exists voice_states_update on public.voice_states;
create policy voice_states_update on public.voice_states
  for update using (user_id = auth.uid());

drop policy if exists voice_states_delete on public.voice_states;
create policy voice_states_delete on public.voice_states
  for delete using (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════
-- pinned_messages
-- ════════════════════════════════════════════════════════════════════
drop policy if exists pinned_messages_select on public.pinned_messages;
create policy pinned_messages_select on public.pinned_messages
  for select using (
    exists (
      select 1 from public.channels c
      join public.community_members cm on cm.community_id = c.community_id
      where c.id = pinned_messages.channel_id and cm.user_id = auth.uid()
    )
  );

drop policy if exists pinned_messages_insert on public.pinned_messages;
create policy pinned_messages_insert on public.pinned_messages
  for insert with check (
    pinned_by = auth.uid()
    and exists (
      select 1 from public.channels c
      join public.community_members cm on cm.community_id = c.community_id
      where c.id = pinned_messages.channel_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin', 'moderator')
    )
  );

drop policy if exists pinned_messages_delete on public.pinned_messages;
create policy pinned_messages_delete on public.pinned_messages
  for delete using (
    pinned_by = auth.uid()
    or exists (
      select 1 from public.channels c
      join public.community_members cm on cm.community_id = c.community_id
      where c.id = pinned_messages.channel_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin', 'moderator')
    )
  );

-- ════════════════════════════════════════════════════════════════════
-- audit_log
-- ════════════════════════════════════════════════════════════════════
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select using (
    exists (
      select 1 from public.community_members cm
      where cm.community_id = audit_log.community_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin', 'moderator')
    )
  );

drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log
  for insert with check (actor_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════
-- web_push_subscriptions (owner-only)
-- ════════════════════════════════════════════════════════════════════
drop policy if exists web_push_select on public.web_push_subscriptions;
create policy web_push_select on public.web_push_subscriptions
  for select using (user_id = auth.uid());

drop policy if exists web_push_insert on public.web_push_subscriptions;
create policy web_push_insert on public.web_push_subscriptions
  for insert with check (user_id = auth.uid());

drop policy if exists web_push_update on public.web_push_subscriptions;
create policy web_push_update on public.web_push_subscriptions
  for update using (user_id = auth.uid());

drop policy if exists web_push_delete on public.web_push_subscriptions;
create policy web_push_delete on public.web_push_subscriptions
  for delete using (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════
-- message_edits
-- ════════════════════════════════════════════════════════════════════
drop policy if exists message_edits_select on public.message_edits;
create policy message_edits_select on public.message_edits
  for select using (
    exists (
      select 1 from public.channel_messages m
      join public.channels c on c.id = m.channel_id
      join public.community_members cm on cm.community_id = c.community_id
      where m.id = message_edits.message_id and cm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.messages m
      join public.conversation_members convm on convm.conversation_id = m.conversation_id
      where m.id = message_edits.conversation_message_id and convm.user_id = auth.uid()
    )
  );

drop policy if exists message_edits_insert on public.message_edits;
create policy message_edits_insert on public.message_edits
  for insert with check (edited_by = auth.uid());

-- ════════════════════════════════════════════════════════════════════
-- channel_categories
-- ════════════════════════════════════════════════════════════════════
drop policy if exists channel_categories_select on public.channel_categories;
create policy channel_categories_select on public.channel_categories
  for select using (
    exists (
      select 1 from public.community_members cm
      where cm.community_id = channel_categories.community_id and cm.user_id = auth.uid()
    )
  );

drop policy if exists channel_categories_insert on public.channel_categories;
create policy channel_categories_insert on public.channel_categories
  for insert with check (
    exists (
      select 1 from public.community_members cm
      where cm.community_id = channel_categories.community_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
  );

drop policy if exists channel_categories_update on public.channel_categories;
create policy channel_categories_update on public.channel_categories
  for update using (
    exists (
      select 1 from public.community_members cm
      where cm.community_id = channel_categories.community_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
  );

drop policy if exists channel_categories_delete on public.channel_categories;
create policy channel_categories_delete on public.channel_categories
  for delete using (
    exists (
      select 1 from public.community_members cm
      where cm.community_id = channel_categories.community_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
  );

-- ════════════════════════════════════════════════════════════════════
-- channels — add member-visible select policy + admin management
-- ════════════════════════════════════════════════════════════════════
drop policy if exists channels_select_member on public.channels;
create policy channels_select_member on public.channels
  for select using (
    exists (
      select 1 from public.community_members cm
      where cm.community_id = channels.community_id and cm.user_id = auth.uid()
    )
  );

drop policy if exists channels_insert_admin on public.channels;
create policy channels_insert_admin on public.channels
  for insert with check (
    exists (
      select 1 from public.community_members cm
      where cm.community_id = channels.community_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin', 'moderator')
    )
  );

drop policy if exists channels_update_admin on public.channels;
create policy channels_update_admin on public.channels
  for update using (
    exists (
      select 1 from public.community_members cm
      where cm.community_id = channels.community_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin', 'moderator')
    )
  );

drop policy if exists channels_delete_admin on public.channels;
create policy channels_delete_admin on public.channels
  for delete using (
    exists (
      select 1 from public.community_members cm
      where cm.community_id = channels.community_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
  );

-- ════════════════════════════════════════════════════════════════════
-- community_members
-- ════════════════════════════════════════════════════════════════════
drop policy if exists community_members_select on public.community_members;
create policy community_members_select on public.community_members
  for select using (
    exists (
      select 1 from public.community_members cm2
      where cm2.community_id = community_members.community_id and cm2.user_id = auth.uid()
    )
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
    or exists (
      select 1 from public.community_members cm2
      where cm2.community_id = community_members.community_id
        and cm2.user_id = auth.uid()
        and cm2.role in ('owner', 'admin')
    )
  );

drop policy if exists community_members_delete on public.community_members;
create policy community_members_delete on public.community_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.community_members cm2
      where cm2.community_id = community_members.community_id
        and cm2.user_id = auth.uid()
        and cm2.role in ('owner', 'admin', 'moderator')
    )
  );

-- ════════════════════════════════════════════════════════════════════
-- channel_messages
-- ════════════════════════════════════════════════════════════════════
drop policy if exists channel_messages_select_member on public.channel_messages;
create policy channel_messages_select_member on public.channel_messages
  for select using (
    exists (
      select 1 from public.channels c
      join public.community_members cm on cm.community_id = c.community_id
      where c.id = channel_messages.channel_id and cm.user_id = auth.uid()
    )
  );

drop policy if exists channel_messages_insert_member on public.channel_messages;
create policy channel_messages_insert_member on public.channel_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.channels c
      join public.community_members cm on cm.community_id = c.community_id
      where c.id = channel_messages.channel_id and cm.user_id = auth.uid()
    )
  );

drop policy if exists channel_messages_update_sender on public.channel_messages;
create policy channel_messages_update_sender on public.channel_messages
  for update using (
    sender_id = auth.uid()
    or exists (
      select 1 from public.channels c
      join public.community_members cm on cm.community_id = c.community_id
      where c.id = channel_messages.channel_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin', 'moderator')
    )
  );

drop policy if exists channel_messages_delete_sender on public.channel_messages;
create policy channel_messages_delete_sender on public.channel_messages
  for delete using (
    sender_id = auth.uid()
    or exists (
      select 1 from public.channels c
      join public.community_members cm on cm.community_id = c.community_id
      where c.id = channel_messages.channel_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin', 'moderator')
    )
  );

-- ════════════════════════════════════════════════════════════════════
-- GRANTS — allow anon+authenticated to read public communities
-- ════════════════════════════════════════════════════════════════════
grant select on public.communities to anon, authenticated;
grant select on public.community_members to anon, authenticated;
grant select on public.channels to anon, authenticated;
grant select on public.channel_categories to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant select on public.community_invites to anon, authenticated;

grant execute on function public.create_community_with_defaults(text, text, text, boolean) to authenticated;
grant execute on function public.join_community_via_invite(text) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
grant execute on function public.get_or_create_dm_conversation(uuid) to authenticated;
grant execute on function public.leave_community(uuid) to authenticated;
grant execute on function public.search_users_by_username(text, integer) to authenticated;
