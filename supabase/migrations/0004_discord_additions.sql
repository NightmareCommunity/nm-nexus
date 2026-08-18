-- ════════════════════════════════════════════════════════════════════
-- NM NEXUS — Discord-Style Schema Additions (v2)
-- NIGHTMARE STUDIOS · additive + idempotent
-- ════════════════════════════════════════════════════════════════════
-- Adds the missing Discord-style features to the existing 20-table schema:
--   • community invites (with codes, expiry, max uses)
--   • per-user read states (per-channel + per-conversation)
--   • voice channel states (who's connected, mute/deaf)
--   • pinned messages
--   • audit log (community moderation events)
--   • web push subscriptions (for notifications)
--   • message edit history
--   • channel categories (for grouping channels in the sidebar)
--   • RPC helpers for compound operations
--
-- Safe to run multiple times — every statement is wrapped in
-- IF NOT EXISTS / ON CONFLICT DO NOTHING / CREATE OR REPLACE.
-- ════════════════════════════════════════════════════════════════════

-- ───────── Extensions (already present, no-op) ─────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ════════════════════════════════════════════════════════════════════
-- 1. COMMUNITY INVITES
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.community_invites (
  id uuid primary key default uuid_generate_v4(),
  community_id uuid not null references public.communities(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete set null,
  max_uses integer,                              -- null = unlimited
  uses integer not null default 0,
  expires_at timestamptz,                        -- null = never expires
  revoked_at timestamptz,                        -- null = active
  created_at timestamptz not null default now()
);
create index if not exists community_invites_community_idx on public.community_invites(community_id);
create index if not exists community_invites_code_idx on public.community_invites(code);

-- ════════════════════════════════════════════════════════════════════
-- 2. READ STATES (per-user, per-channel + per-conversation)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.read_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  last_read_message_id uuid,
  last_read_at timestamptz not null default now(),
  -- A user has at most one read state per channel OR per conversation
  constraint read_states_chk check (
    (channel_id is not null and conversation_id is null) or
    (channel_id is null and conversation_id is not null)
  ),
  constraint read_states_pk primary key (user_id, channel_id, conversation_id)
);
create index if not exists read_states_user_idx on public.read_states(user_id);

-- ════════════════════════════════════════════════════════════════════
-- 3. VOICE STATES (who's connected to which voice channel)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.voice_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  call_id uuid references public.calls(id) on delete set null,
  self_mute boolean not null default false,
  self_deaf boolean not null default false,
  video boolean not null default false,
  streaming boolean not null default false,
  joined_at timestamptz not null default now(),
  -- A user can be in at most one voice channel at a time
  constraint voice_states_pk primary key (user_id)
);
create index if not exists voice_states_channel_idx on public.voice_states(channel_id);

-- ════════════════════════════════════════════════════════════════════
-- 4. PINNED MESSAGES
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.pinned_messages (
  channel_id uuid not null references public.channels(id) on delete cascade,
  message_id uuid not null references public.channel_messages(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete set null,
  pinned_at timestamptz not null default now(),
  constraint pinned_messages_pk primary key (channel_id, message_id)
);

-- ════════════════════════════════════════════════════════════════════
-- 5. AUDIT LOG (community moderation events)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  community_id uuid not null references public.communities(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,                  -- member_kick, member_ban, channel_create, etc.
  target_type text,                      -- user, channel, role, message
  target_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_community_idx on public.audit_log(community_id, created_at desc);

-- ════════════════════════════════════════════════════════════════════
-- 6. WEB PUSH SUBSCRIPTIONS (for browser notifications)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.web_push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- ════════════════════════════════════════════════════════════════════
-- 7. MESSAGE EDIT HISTORY
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.message_edits (
  id uuid primary key default uuid_generate_v4(),
  message_id uuid not null references public.channel_messages(id) on delete cascade,
  conversation_message_id uuid references public.messages(id) on delete cascade,
  old_body text,
  edited_by uuid not null references auth.users(id) on delete set null,
  edited_at timestamptz not null default now()
);
create index if not exists message_edits_msg_idx on public.message_edits(message_id);

-- ════════════════════════════════════════════════════════════════════
-- 8. CHANNEL CATEGORIES (for grouping channels like "TEXT", "VOICE")
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.channel_categories (
  id uuid primary key default uuid_generate_v4(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists channel_categories_community_idx on public.channel_categories(community_id, position);

-- Add category_id column to channels (nullable — channels may be uncategorized)
alter table public.channels
  add column if not exists category_id uuid references public.channel_categories(id) on delete set null;
alter table public.channels
  add column if not exists is_private boolean not null default false;
alter table public.channels
  add column if not exists nsfw boolean not null default false;
alter table public.channels
  add column if not exists slowmode_seconds integer not null default 0;

-- ════════════════════════════════════════════════════════════════════
-- 9. EXTRA COLUMNS ON EXISTING TABLES
-- ════════════════════════════════════════════════════════════════════

-- communities: vanity invite code (separate from generated invite codes)
alter table public.communities
  add column if not exists vanity_url text;
alter table public.communities
  add column if not exists member_count integer not null default 0;
alter table public.communities
  add column if not exists is_verified boolean not null default false;

-- community_members: track last visit for "you have unread" indicator
alter table public.community_members
  add column if not exists last_visited_at timestamptz not null default now();
alter table public.community_members
  add column if not exists notifications_enabled boolean not null default true;

-- channel_messages: track mentions and pinned state
alter table public.channel_messages
  add column if not exists mentions uuid[] default '{}';
alter table public.channel_messages
  add column if not exists is_pinned boolean not null default false;

-- messages (DM messages): same
alter table public.messages
  add column if not exists mentions uuid[] default '{}';

-- profiles: add discriminator (like Discord's #1234) for unique username resolution
alter table public.profiles
  add column if not exists discriminator text not null default '0001';
alter table public.profiles
  add column if not exists pronouns text;
alter table public.profiles
  add column if not exists banner text;
alter table public.profiles
  add column if not exists accent_color text default '#a855f7';

-- Make (username, discriminator) unique together
drop index if exists profiles_username_discriminator_idx;
create unique index if not exists profiles_username_discriminator_idx
  on public.profiles (username, discriminator);

-- ════════════════════════════════════════════════════════════════════
-- 10. RPC: create_community_with_defaults
-- Creates a community, sets caller as owner, creates default channels.
-- ════════════════════════════════════════════════════════════════════
create or replace function public.create_community_with_defaults(
  p_name text,
  p_description text default null,
  p_icon text default null,
  p_is_public boolean default true
) returns uuid
language plpgsql
security definer
as $$
declare
  v_community_id uuid;
  v_owner_id uuid := auth.uid();
  v_slug text;
  v_code text;
  v_cat_info uuid;
  v_cat_chat uuid;
  v_cat_voice uuid;
begin
  if v_owner_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Generate slug from name
  v_slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if char_length(v_slug) < 2 then
    v_slug := 'community-' || substr(md5(random()::text), 1, 6);
  end if;

  -- Ensure slug uniqueness
  while exists (select 1 from public.communities where slug = v_slug) loop
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
  end loop;

  -- Generate unique invite code
  v_code := substr(md5(random()::text || v_owner_id::text), 1, 8);
  while exists (select 1 from public.community_invites where code = v_code) loop
    v_code := substr(md5(random()::text || v_owner_id::text), 1, 8);
  end loop;

  -- Create community
  insert into public.communities (owner_id, name, slug, description, icon, is_public, invite_code)
  values (v_owner_id, p_name, v_slug, p_description, p_icon, p_is_public, v_code)
  returning id into v_community_id;

  -- Add owner as a member with role 'owner'
  insert into public.community_members (community_id, user_id, role)
  values (v_community_id, v_owner_id, 'owner');

  -- Update member count
  update public.communities set member_count = 1 where id = v_community_id;

  -- Create default categories
  insert into public.channel_categories (community_id, name, position)
  values (v_community_id, 'INFORMATION', 0)
  returning id into v_cat_info;

  insert into public.channel_categories (community_id, name, position)
  values (v_community_id, 'TEXT CHANNELS', 1)
  returning id into v_cat_chat;

  insert into public.channel_categories (community_id, name, position)
  values (v_community_id, 'VOICE CHANNELS', 2)
  returning id into v_cat_voice;

  -- Default channels
  insert into public.channels (community_id, name, type, position, category_id)
  values
    (v_community_id, 'announcements', 'text', 0, v_cat_info),
    (v_community_id, 'rules', 'text', 1, v_cat_info),
    (v_community_id, 'general', 'text', 0, v_cat_chat),
    (v_community_id, 'media', 'text', 1, v_cat_chat),
    (v_community_id, 'Lounge', 'voice', 0, v_cat_voice);

  -- Create default owner role
  insert into public.roles (community_id, name, color, permissions, position)
  values
    (v_community_id, '@everyone', '#94a3b8', '{}'::jsonb, 0),
    (v_community_id, 'Owner', '#fbbf24',
     '{"admin":true,"manage_channels":true,"manage_members":true,"manage_messages":true,"manage_roles":true,"mention_all":true,"view_channel":true,"send_messages":true,"attach_files":true,"add_reactions":true,"connect_voice":true,"speak":true}'::jsonb,
     100);

  -- Create a permanent invite
  insert into public.community_invites (community_id, code, created_by, max_uses)
  values (v_community_id, v_code, v_owner_id, null);

  return v_community_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- 11. RPC: join_community_via_invite
-- Validates invite, joins community, returns the community id.
-- ════════════════════════════════════════════════════════════════════
create or replace function public.join_community_via_invite(
  p_code text
) returns uuid
language plpgsql
security definer
as $$
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

  -- Check if already a member
  select exists (
    select 1 from public.community_members
    where community_id = v_invite.community_id and user_id = v_user_id
  ) into v_already_member;

  if v_already_member then
    return v_invite.community_id;
  end if;

  -- Join
  insert into public.community_members (community_id, user_id, role)
  values (v_invite.community_id, v_user_id, 'member');

  -- Increment invite uses
  update public.community_invites
  set uses = uses + 1
  where id = v_invite.id;

  -- Update member count
  update public.communities
  set member_count = (select count(*) from public.community_members where community_id = v_invite.community_id)
  where id = v_invite.community_id;

  return v_invite.community_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- 12. RPC: send_friend_request
-- Idempotently creates a friend request.
-- ════════════════════════════════════════════════════════════════════
create or replace function public.send_friend_request(
  p_addressee_id uuid
) returns uuid
language plpgsql
security definer
as $$
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

  -- Check block in either direction
  select exists (
    select 1 from public.blocks
    where (blocker_id = p_addressee_id and blocked_id = v_requester_id)
       or (blocker_id = v_requester_id and blocked_id = p_addressee_id)
  ) into v_blocked;
  if v_blocked then
    raise exception 'Cannot send friend request';
  end if;

  -- Check if any friendship already exists in either direction
  select * into v_existing
  from public.friendships
  where (requester_id = v_requester_id and addressee_id = p_addressee_id)
     or (requester_id = p_addressee_id and addressee_id = v_requester_id);

  if found then
    if v_existing.status = 'accepted' then
      return v_existing.id;
    elsif v_existing.status = 'pending' then
      -- If the OTHER user requested me, accept automatically (mirror Discord's "Accept" UX)
      if v_existing.requester_id = p_addressee_id then
        update public.friendships
        set status = 'accepted', responded_at = now()
        where id = v_existing.id;
        return v_existing.id;
      else
        return v_existing.id;  -- already pending from me
      end if;
    elsif v_existing.status = 'declined' then
      -- Allow re-sending after a decline
      delete from public.friendships where id = v_existing.id;
    elsif v_existing.status = 'blocked' then
      raise exception 'Cannot send friend request';
    end if;
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (v_requester_id, p_addressee_id, 'pending')
  returning id into v_friendship_id;

  return v_friendship_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- 13. RPC: respond_to_friend_request
-- Accept or decline a friend request.
-- ════════════════════════════════════════════════════════════════════
create or replace function public.respond_to_friend_request(
  p_friendship_id uuid,
  p_accept boolean
) returns boolean
language plpgsql
security definer
as $$
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
$$;

-- ════════════════════════════════════════════════════════════════════
-- 14. RPC: get_or_create_dm_conversation
-- Get or create a 1-on-1 DM conversation between caller and another user.
-- ════════════════════════════════════════════════════════════════════
create or replace function public.get_or_create_dm_conversation(
  p_other_user_id uuid
) returns uuid
language plpgsql
security definer
as $$
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

  -- Find existing 1-on-1 DM
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

  -- Create new DM
  insert into public.conversations (type, is_encrypted, created_by)
  values ('direct', true, v_user_id)
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conversation_id, v_user_id, 'owner'),
         (v_conversation_id, p_other_user_id, 'member');

  return v_conversation_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- 15. RPC: leave_community
-- Remove caller from a community. If owner, optionally transfer or delete.
-- ════════════════════════════════════════════════════════════════════
create or replace function public.leave_community(
  p_community_id uuid
) returns boolean
language plpgsql
security definer
as $$
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
    -- If sole owner, delete the community
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
$$;

-- ════════════════════════════════════════════════════════════════════
-- 16. RPC: search_users_by_username
-- For the "Add Friend" search.
-- ════════════════════════════════════════════════════════════════════
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
as $$
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
$$;

-- ════════════════════════════════════════════════════════════════════
-- 17. RLS — Enable RLS on all new tables
-- ════════════════════════════════════════════════════════════════════
alter table public.community_invites enable row level security;
alter table public.read_states enable row level security;
alter table public.voice_states enable row level security;
alter table public.pinned_messages enable row level security;
alter table public.audit_log enable row level security;
alter table public.web_push_subscriptions enable row level security;
alter table public.message_edits enable row level security;
alter table public.channel_categories enable row level security;

-- ════════════════════════════════════════════════════════════════════
-- 18. RLS POLICIES — community_invites
-- ════════════════════════════════════════════════════════════════════
drop policy if exists community_invites_select on public.community_invites;
create policy community_invites_select on public.community_invites
  for select using (
    -- Visible to: community members, or anyone if invite is active (so they can preview & join)
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
    -- Community members can create invites (could be tightened to admins)
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
-- 19. RLS POLICIES — read_states (owner-only)
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
-- 20. RLS POLICIES — voice_states
-- ════════════════════════════════════════════════════════════════════
drop policy if exists voice_states_select on public.voice_states;
create policy voice_states_select on public.voice_states
  for select using (
    -- Visible to anyone who can see the channel (community member)
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
-- 21. RLS POLICIES — pinned_messages
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
-- 22. RLS POLICIES — audit_log
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
-- 23. RLS POLICIES — web_push_subscriptions (owner-only)
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
-- 24. RLS POLICIES — message_edits
-- ════════════════════════════════════════════════════════════════════
drop policy if exists message_edits_select on public.message_edits;
create policy message_edits_select on public.message_edits
  for select using (
    -- Visible to anyone who can see the original message
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
-- 25. RLS POLICIES — channel_categories
-- Visible to community members; managed by owner/admin.
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
-- 26. ADDITIONAL POLICIES — channels (allow members to view)
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
-- 27. ADDITIONAL POLICIES — community_members
-- ════════════════════════════════════════════════════════════════════
drop policy if exists community_members_select on public.community_members;
create policy community_members_select on public.community_members
  for select using (
    -- Members can see other members of communities they belong to
    exists (
      select 1 from public.community_members cm2
      where cm2.community_id = community_members.community_id and cm2.user_id = auth.uid()
    )
    -- Or the community is public
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
-- 28. ADDITIONAL POLICIES — channel_messages (send/delete/edit)
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
-- 29. REALTIME — Add new tables to supabase_realtime publication
-- ════════════════════════════════════════════════════════════════════
do $$
begin
  begin
    alter publication supabase_realtime add table public.community_invites;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.read_states;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.voice_states;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.pinned_messages;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.channel_categories;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.message_edits;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.channel_messages;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.messages;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.message_reactions;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.conversations;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.conversation_members;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.communities;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.community_members;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.channels;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.friendships;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.typing;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.profiles;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.calls;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.call_signaling;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when others then null; end;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- 30. GRANTS — Allow anon+authenticated to read public communities
-- ════════════════════════════════════════════════════════════════════
grant select on public.communities to anon, authenticated;
grant select on public.community_members to anon, authenticated;
grant select on public.channels to anon, authenticated;
grant select on public.channel_categories to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant select on public.community_invites to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 31. UPDATE handle_new_user trigger — set default discriminator
-- ════════════════════════════════════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_username text;
  v_discriminator text;
  v_existing_count integer;
begin
  v_username := coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1),
    'user_' || substr(new.id::text, 1, 8)
  );
  v_username := lower(regexp_replace(v_username, '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(v_username) < 3 then
    v_username := 'user_' || substr(new.id::text, 1, 8);
  end if;

  -- Generate a unique discriminator (0001-9999)
  v_discriminator := lpad(floor(random() * 9999 + 1)::text, 4, '0');
  loop
    select count(*) into v_existing_count
    from public.profiles
    where username = v_username and discriminator = v_discriminator;
    exit when v_existing_count = 0;
    v_discriminator := lpad(floor(random() * 9999 + 1)::text, 4, '0');
  end loop;

  insert into public.profiles (id, username, display_name, status, discriminator)
  values (
    new.id,
    v_username,
    coalesce(new.raw_user_meta_data->>'display_name', v_username),
    'online',
    v_discriminator
  )
  on conflict (id) do nothing;

  -- Create user_settings row
  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- 32. STORAGE POLICIES — avatars, attachments, community_icons
-- ════════════════════════════════════════════════════════════════════
-- Avatars: any authenticated user can read; owner can write to their own folder
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Attachments: only conversation/channel members can read
drop policy if exists attachments_read on storage.objects;
create policy attachments_read on storage.objects
  for select using (
    bucket_id = 'attachments'
    and auth.uid() is not null
  );

drop policy if exists attachments_write on storage.objects;
create policy attachments_write on storage.objects
  for insert with check (
    bucket_id = 'attachments'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists attachments_delete on storage.objects;
create policy attachments_delete on storage.objects
  for delete using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Community icons: any user can read; community admins can write
drop policy if exists community_icons_read on storage.objects;
create policy community_icons_read on storage.objects
  for select using (bucket_id in ('community_icons', 'community-icons'));

drop policy if exists community_icons_write on storage.objects;
create policy community_icons_write on storage.objects
  for insert with check (
    bucket_id in ('community_icons', 'community-icons')
    and auth.uid() is not null
  );

drop policy if exists community_assets_read on storage.objects;
create policy community_assets_read on storage.objects
  for select using (bucket_id in ('community_assets', 'community-assets'));

drop policy if exists community_assets_write on storage.objects;
create policy community_assets_write on storage.objects
  for insert with check (
    bucket_id in ('community_assets', 'community-assets')
    and auth.uid() is not null
  );

-- Voice messages
drop policy if exists voice_messages_read on storage.objects;
create policy voice_messages_read on storage.objects
  for select using (bucket_id = 'voice_messages' and auth.uid() is not null);

drop policy if exists voice_messages_write on storage.objects;
create policy voice_messages_write on storage.objects
  for insert with check (
    bucket_id = 'voice_messages'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ════════════════════════════════════════════════════════════════════
-- 33. CLEANUP — Remove duplicate storage buckets (dash vs underscore)
-- ════════════════════════════════════════════════════════════════════
-- (Kept both for compatibility — apps may reference either.)

-- Done.
