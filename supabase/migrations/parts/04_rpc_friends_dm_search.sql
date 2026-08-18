-- RPCs: friend requests + DM creation + community leave + user search

create or replace function public.send_friend_request(
  p_addressee_id uuid
) returns uuid
language plpgsql
security definer
as $func$
declare
  v_requester_id uuid := auth.uid();
  v_existing public.friendships%rowtype;
  v_blocked boolean;
  v_friendship_id uuid;
begin
  if v_requester_id is null then
    raise exception 'Not authenticated';
  end if;
  if v_requester_id = p_addressee_id then
    raise exception 'Cannot friend yourself';
  end if;

  select exists (
    select 1 from public.blocks
    where (blocker_id = p_addressee_id and blocked_id = v_requester_id)
       or (blocker_id = v_requester_id and blocked_id = p_addressee_id)
  ) into v_blocked;
  if v_blocked then
    raise exception 'Cannot send friend request';
  end if;

  select * into v_existing
  from public.friendships
  where (requester_id = v_requester_id and addressee_id = p_addressee_id)
     or (requester_id = p_addressee_id and addressee_id = v_requester_id);

  if found then
    if v_existing.status = 'accepted' then
      return v_existing.id;
    end if;
    if v_existing.status = 'pending' then
      if v_existing.requester_id = p_addressee_id then
        update public.friendships
        set status = 'accepted', responded_at = now()
        where id = v_existing.id;
        return v_existing.id;
      else
        return v_existing.id;
      end if;
    end if;
    if v_existing.status = 'declined' then
      delete from public.friendships where id = v_existing.id;
    end if;
    if v_existing.status = 'blocked' then
      raise exception 'Cannot send friend request';
    end if;
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (v_requester_id, p_addressee_id, 'pending')
  returning id into v_friendship_id;

  return v_friendship_id;
end;
$func$;

create or replace function public.respond_to_friend_request(
  p_friendship_id uuid,
  p_accept boolean
) returns boolean
language plpgsql
security definer
as $func$
declare
  v_friendship public.friendships%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_friendship from public.friendships where id = p_friendship_id;
  if not found then
    raise exception 'Friend request not found';
  end if;
  if v_friendship.addressee_id != v_user_id then
    raise exception 'Not authorized to respond to this request';
  end if;

  update public.friendships
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = p_friendship_id;

  return true;
end;
$func$;

create or replace function public.get_or_create_dm_conversation(
  p_other_user_id uuid
) returns uuid
language plpgsql
security definer
as $func$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if v_user_id = p_other_user_id then
    raise exception 'Cannot DM yourself';
  end if;

  select c.id into v_conversation_id
  from public.conversations c
  where c.type = 'direct'
    and c.id in (
      select conversation_id from public.conversation_members cm1
      where cm1.user_id = v_user_id
      intersect
      select conversation_id from public.conversation_members cm2
      where cm2.user_id = p_other_user_id
    )
    and (
      select count(*) from public.conversation_members where conversation_id = c.id
    ) = 2
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into public.conversations (type, is_encrypted, created_by)
  values ('direct', true, v_user_id)
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conversation_id, v_user_id, 'owner'),
         (v_conversation_id, p_other_user_id, 'member');

  return v_conversation_id;
end;
$func$;

create or replace function public.leave_community(
  p_community_id uuid
) returns boolean
language plpgsql
security definer
as $func$
declare
  v_user_id uuid := auth.uid();
  v_member public.community_members%rowtype;
  v_owner_count integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_member from public.community_members
  where community_id = p_community_id and user_id = v_user_id;
  if not found then
    raise exception 'Not a member';
  end if;

  if v_member.role = 'owner' then
    select count(*) into v_owner_count
    from public.community_members
    where community_id = p_community_id and role = 'owner';
    if v_owner_count = 1 then
      delete from public.communities where id = p_community_id;
      return true;
    end if;
  end if;

  delete from public.community_members
  where community_id = p_community_id and user_id = v_user_id;

  update public.communities
  set member_count = (select count(*) from public.community_members where community_id = p_community_id)
  where id = p_community_id;

  return true;
end;
$func$;

create or replace function public.search_users_by_username(
  p_query text,
  p_limit integer default 10
) returns table (
  id uuid,
  username text,
  display_name text,
  avatar text,
  avatar_color text,
  status text,
  discriminator text
)
language plpgsql
security definer
as $func$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select p.id, p.username, p.display_name, p.avatar, p.avatar_color, p.status, p.discriminator
  from public.profiles p
  where p.id != auth.uid()
    and (
      p.username ilike '%' || p_query || '%'
      or p.display_name ilike '%' || p_query || '%'
    )
  order by
    case when p.username ilike p_query || '%' then 0 else 1 end,
    p.username
  limit least(p_limit, 25);
end;
$func$;
