-- RPC: join_community_via_invite

create or replace function public.join_community_via_invite(
  p_code text
) returns uuid
language plpgsql
security definer
as $func$
declare
  v_invite public.community_invites%rowtype;
  v_user_id uuid := auth.uid();
  v_already_member boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite
  from public.community_invites
  where code = p_code
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    raise exception 'Invalid or expired invite';
  end if;

  if v_invite.max_uses is not null and v_invite.uses >= v_invite.max_uses then
    raise exception 'Invite has been used up';
  end if;

  select exists (
    select 1 from public.community_members
    where community_id = v_invite.community_id and user_id = v_user_id
  ) into v_already_member;

  if v_already_member then
    return v_invite.community_id;
  end if;

  insert into public.community_members (community_id, user_id, role)
  values (v_invite.community_id, v_user_id, 'member');

  update public.community_invites
  set uses = uses + 1
  where id = v_invite.id;

  update public.communities
  set member_count = (select count(*) from public.community_members where community_id = v_invite.community_id)
  where id = v_invite.community_id;

  return v_invite.community_id;
end;
$func$;
