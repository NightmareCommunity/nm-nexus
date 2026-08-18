-- Convert helper functions to LANGUAGE plpgsql to prevent inlining into policy expressions.
-- This breaks Postgres's static recursion detection while preserving runtime behavior.

drop function if exists public.is_community_member(uuid);
create or replace function public.is_community_member(p_community_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $func$
declare
  v_count integer;
begin
  if p_community_id is null or auth.uid() is null then
    return false;
  end if;
  select count(*) into v_count
  from public.community_members cm
  where cm.community_id = p_community_id and cm.user_id = auth.uid();
  return v_count > 0;
end;
$func$;

drop function if exists public.is_community_admin(uuid);
create or replace function public.is_community_admin(p_community_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $func$
declare
  v_count integer;
begin
  if p_community_id is null or auth.uid() is null then
    return false;
  end if;
  select count(*) into v_count
  from public.community_members cm
  where cm.community_id = p_community_id
    and cm.user_id = auth.uid()
    and cm.role in ('owner', 'admin');
  return v_count > 0;
end;
$func$;

drop function if exists public.is_community_moderator(uuid);
create or replace function public.is_community_moderator(p_community_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $func$
declare
  v_count integer;
begin
  if p_community_id is null or auth.uid() is null then
    return false;
  end if;
  select count(*) into v_count
  from public.community_members cm
  where cm.community_id = p_community_id
    and cm.user_id = auth.uid()
    and cm.role in ('owner', 'admin', 'moderator');
  return v_count > 0;
end;
$func$;

-- Also a helper for conversation membership (avoids recursion on conversation_members)
drop function if exists public.is_conversation_member(uuid);
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $func$
declare
  v_count integer;
begin
  if p_conversation_id is null or auth.uid() is null then
    return false;
  end if;
  select count(*) into v_count
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid();
  return v_count > 0;
end;
$func$;

grant execute on function public.is_community_member(uuid) to anon, authenticated;
grant execute on function public.is_community_admin(uuid) to anon, authenticated;
grant execute on function public.is_community_moderator(uuid) to anon, authenticated;
grant execute on function public.is_conversation_member(uuid) to anon, authenticated;

-- Re-create the conversation_members select policy using the helper (breaks recursion)
drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select on public.conversation_members
  for select using (public.is_conversation_member(conversation_id));

-- Re-create messages policies using the helper
drop policy if exists messages_select_member on public.messages;
create policy messages_select_member on public.messages
  for select using (public.is_conversation_member(conversation_id));

drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages
  for insert with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists messages_update_sender on public.messages;
create policy messages_update_sender on public.messages
  for update using (sender_id = auth.uid());

drop policy if exists messages_delete_sender on public.messages;
create policy messages_delete_sender on public.messages
  for delete using (sender_id = auth.uid());

-- Re-grant on messages
grant select on public.messages to authenticated;
grant insert on public.messages to authenticated;
grant update on public.messages to authenticated;
grant delete on public.messages to authenticated;
