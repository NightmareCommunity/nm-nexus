-- ════════════════════════════════════════════════════════════════════
-- NM NEXUS — Complete Idempotent Schema Migration
-- NIGHTMARE STUDIOS · by NightmareCommunity
-- ════════════════════════════════════════════════════════════════════
-- SAFE TO RUN MULTIPLE TIMES — every statement is wrapped in
-- IF NOT EXISTS / ON CONFLICT DO NOTHING / CREATE OR REPLACE / DROP IF EXISTS
--
-- How to apply:
--   1. Open Supabase Dashboard → SQL Editor → New query
--   2. Paste this entire file
--   3. Click Run (Cmd/Ctrl + Enter)
--   4. Should succeed with no errors. Re-running is also safe.
-- ════════════════════════════════════════════════════════════════════

-- ───────── Extensions ─────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ════════════════════════════════════════════════════════════════════
-- TABLES (all use IF NOT EXISTS — safe to re-run)
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 32
    and username ~ '^[a-zA-Z0-9_]+$'),
  display_name text,
  avatar text,
  avatar_color text default '#7c3aed',
  bio text check (char_length(bio) <= 280),
  status text default 'offline' check (status in ('online','away','busy','offline')),
  custom_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  identity_key_public text,
  signed_prekey_public text,
  signed_prekey_signature text,
  one_time_prekeys jsonb default '[]'::jsonb,
  notif_messages boolean default true,
  notif_mentions boolean default true,
  notif_calls boolean default true,
  notif_community boolean default true,
  presence_visible boolean default true,
  read_receipts boolean default true,
  typing_indicators boolean default true,
  who_can_message text default 'everyone' check (who_can_message in ('everyone','friends','nobody')),
  who_can_call text default 'friends' check (who_can_call in ('everyone','friends','nobody')),
  accent_color text default '#a855f7',
  reduced_motion boolean default false,
  encrypted_backup jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  platform text,
  identity_key_public text not null,
  signed_prekey_public text,
  signed_prekey_signature text,
  push_token text,
  last_active timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, identity_key_public)
);

create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in ('direct','group')),
  title text,
  avatar text,
  is_encrypted boolean not null default true,
  group_key_wrapped jsonb default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  last_read_message_id uuid,
  muted boolean default false,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid unique not null default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  encrypted_payload text,
  encryption_nonce text,
  encryption_metadata jsonb,
  plaintext_body text,
  message_type text not null default 'text' check (message_type in
    ('text','image','video','audio','file','voice_message','system','call_event')),
  reply_to uuid references public.messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (char_length(reaction) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, reaction)
);

create table if not exists public.attachments (
  id uuid primary key default uuid_generate_v4(),
  message_id uuid references public.messages(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  encrypted_metadata text,
  file_name text,
  mime_type text,
  file_size bigint,
  width int,
  height int,
  duration_seconds real,
  thumbnail_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.communities (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  slug text unique not null check (slug ~ '^[a-z0-9-]+$'),
  description text,
  icon text,
  banner text,
  is_public boolean default true,
  invite_code text unique default substr(md5(random()::text), 1, 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','moderator','member')),
  nickname text,
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table if not exists public.channels (
  id uuid primary key default uuid_generate_v4(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50
    and name ~ '^[a-z0-9-]+$'),
  topic text,
  type text not null check (type in ('text','voice','announcement')),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.channel_messages (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid unique not null default uuid_generate_v4(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  message_type text not null default 'text' check (message_type in
    ('text','image','video','audio','file','voice_message','system')),
  reply_to uuid references public.channel_messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.roles (
  id uuid primary key default uuid_generate_v4(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  color text default '#7c3aed',
  permissions jsonb not null default '{}'::jsonb,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (community_id, name)
);

create table if not exists public.calls (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete cascade,
  initiated_by uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('voice','video')),
  status text not null default 'ringing' check (status in
    ('ringing','active','ended','missed','rejected','failed')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (conversation_id is not null or channel_id is not null)
);

create table if not exists public.call_participants (
  call_id uuid not null references public.calls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (call_id, user_id)
);

create table if not exists public.call_signaling (
  id uuid primary key default uuid_generate_v4(),
  call_id uuid not null references public.calls(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  signal_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default uuid_generate_v4(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','blocked','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('message','mention','friend_request','friend_accepted',
    'incoming_call','missed_call','community_invite','channel_activity','reaction','reply')),
  title text,
  body text,
  payload jsonb,
  read boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists public.typing (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_heartbeat timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- ════════════════════════════════════════════════════════════════════
-- INDEXES (all use IF NOT EXISTS)
-- ════════════════════════════════════════════════════════════════════
create index if not exists idx_profiles_username_lower on public.profiles (lower(username));
create index if not exists idx_profiles_status on public.profiles (status);
create index if not exists idx_conv_members_user on public.conversation_members (user_id);
create index if not exists idx_conv_members_conv on public.conversation_members (conversation_id);
create index if not exists idx_messages_conv_created on public.messages (conversation_id, created_at desc);
create index if not exists idx_messages_sender on public.messages (sender_id);
create index if not exists idx_messages_client_id on public.messages (client_id);
create index if not exists idx_reactions_message on public.message_reactions (message_id);
create index if not exists idx_attachments_owner on public.attachments (owner_id);
create index if not exists idx_attachments_message on public.attachments (message_id);
create index if not exists idx_community_members_user on public.community_members (user_id);
create index if not exists idx_community_members_community on public.community_members (community_id);
create index if not exists idx_channels_community on public.channels (community_id, position);
create index if not exists idx_channel_messages_channel_created on public.channel_messages (channel_id, created_at desc);
create index if not exists idx_calls_conversation on public.calls (conversation_id);
create index if not exists idx_calls_channel on public.calls (channel_id);
create index if not exists idx_call_signaling_to_user on public.call_signaling (to_user, created_at);
create index if not exists idx_call_signaling_call on public.call_signaling (call_id);
create index if not exists idx_friendships_addressee on public.friendships (addressee_id, status);
create index if not exists idx_friendships_requester on public.friendships (requester_id, status);
create index if not exists idx_blocks_blocker on public.blocks (blocker_id);
create index if not exists idx_blocks_blocked on public.blocks (blocked_id);
create index if not exists idx_notifications_user_unread on public.notifications (user_id, read, created_at desc);
create index if not exists idx_typing_conv on public.typing (conversation_id);
create index if not exists idx_devices_user on public.devices (user_id);

-- ════════════════════════════════════════════════════════════════════
-- TRIGGERS & FUNCTIONS (CREATE OR REPLACE — safe to re-run)
-- ════════════════════════════════════════════════════════════════════

-- Trigger: create profile + settings when a new auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_username text;
begin
  generated_username := split_part(new.email, '@', 1);
  while exists (select 1 from public.profiles where username = generated_username) loop
    generated_username := generated_username || '_' || substr(md5(random()::text), 1, 4);
  end loop;

  insert into public.profiles (id, username, display_name, status)
  values (new.id, generated_username, generated_username, 'offline')
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger: update updated_at on profiles
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_user_settings on public.user_settings;
create trigger touch_user_settings before update on public.user_settings
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_conversations on public.conversations;
create trigger touch_conversations before update on public.conversations
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_communities on public.communities;
create trigger touch_communities before update on public.communities
  for each row execute function public.touch_updated_at();

-- RPC: Atomically consume a one-time prekey (X3DH)
create or replace function public.fetch_prekey_bundle(target_user_id uuid)
returns table (
  identity_key text,
  signed_prekey text,
  signed_prekey_sig text,
  one_time_prekey text,
  device_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  bundle_identity text;
  bundle_spk text;
  bundle_sig text;
  otp text;
  dev_id uuid;
  remaining jsonb;
begin
  select id, identity_key_public, signed_prekey_public, signed_prekey_signature
  into dev_id, bundle_identity, bundle_spk, bundle_sig
  from public.devices
  where user_id = target_user_id
  order by last_active desc
  limit 1;

  if not found then
    return;
  end if;

  select one_time_prekeys into remaining
  from public.user_settings
  where user_id = target_user_id
  for update;

  if remaining is not null and jsonb_array_length(remaining) > 0 then
    otp := remaining -> 0 ->> 'key';
    remaining := remaining - 0;
    update public.user_settings set one_time_prekeys = remaining
    where user_id = target_user_id;
  else
    otp := null;
  end if;

  return query select bundle_identity, bundle_spk, bundle_sig, otp, dev_id;
end;
$$;

grant execute on function public.fetch_prekey_bundle(uuid) to authenticated;

-- View: device public keys (for E2EE key exchange)
create or replace view public.device_keys as
  select d.id, d.user_id, d.identity_key_public, d.signed_prekey_public,
         d.signed_prekey_signature, d.created_at
  from public.devices d;

-- ════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (DROP IF EXISTS + CREATE — safe to re-run)
-- ════════════════════════════════════════════════════════════════════

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.devices enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.attachments enable row level security;
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.channels enable row level security;
alter table public.channel_messages enable row level security;
alter table public.roles enable row level security;
alter table public.calls enable row level security;
alter table public.call_participants enable row level security;
alter table public.call_signaling enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.notifications enable row level security;
alter table public.typing enable row level security;

-- profiles
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- user_settings
drop policy if exists "settings_select_self" on public.user_settings;
create policy "settings_select_self" on public.user_settings
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "settings_update_self" on public.user_settings;
create policy "settings_update_self" on public.user_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "settings_insert_self" on public.user_settings;
create policy "settings_insert_self" on public.user_settings
  for insert to authenticated with check (auth.uid() = user_id);

-- devices
drop policy if exists "devices_select_self" on public.devices;
create policy "devices_select_self" on public.devices
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "devices_insert_self" on public.devices;
create policy "devices_insert_self" on public.devices
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "devices_update_self" on public.devices;
create policy "devices_update_self" on public.devices
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "devices_delete_self" on public.devices;
create policy "devices_delete_self" on public.devices
  for delete to authenticated using (auth.uid() = user_id);

-- conversations
drop policy if exists "conversations_select_member" on public.conversations;
create policy "conversations_select_member" on public.conversations
  for select to authenticated using (
    exists (select 1 from public.conversation_members cm
      where cm.conversation_id = conversations.id and cm.user_id = auth.uid())
  );
drop policy if exists "conversations_insert_creator" on public.conversations;
create policy "conversations_insert_creator" on public.conversations
  for insert to authenticated with check (auth.uid() = created_by);
drop policy if exists "conversations_update_member" on public.conversations;
create policy "conversations_update_member" on public.conversations
  for update to authenticated using (
    exists (select 1 from public.conversation_members cm
      where cm.conversation_id = conversations.id and cm.user_id = auth.uid())
  );

-- conversation_members
drop policy if exists "cm_select_member" on public.conversation_members;
create policy "cm_select_member" on public.conversation_members
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.conversation_members cm2
      where cm2.conversation_id = conversation_members.conversation_id and cm2.user_id = auth.uid())
  );
drop policy if exists "cm_insert_self" on public.conversation_members;
create policy "cm_insert_self" on public.conversation_members
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "cm_update_self" on public.conversation_members;
create policy "cm_update_self" on public.conversation_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "cm_delete_self" on public.conversation_members;
create policy "cm_delete_self" on public.conversation_members
  for delete to authenticated using (user_id = auth.uid());

-- messages
drop policy if exists "messages_select_member" on public.messages;
create policy "messages_select_member" on public.messages
  for select to authenticated using (
    exists (select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid())
  );
drop policy if exists "messages_insert_member" on public.messages;
create policy "messages_insert_member" on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and exists (select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid())
  );
drop policy if exists "messages_update_sender" on public.messages;
create policy "messages_update_sender" on public.messages
  for update to authenticated using (sender_id = auth.uid());
drop policy if exists "messages_delete_sender" on public.messages;
create policy "messages_delete_sender" on public.messages
  for delete to authenticated using (sender_id = auth.uid());

-- message_reactions
drop policy if exists "reactions_select_member" on public.message_reactions;
create policy "reactions_select_member" on public.message_reactions
  for select to authenticated using (
    exists (select 1 from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id
      where m.id = message_reactions.message_id and cm.user_id = auth.uid())
  );
drop policy if exists "reactions_insert_self" on public.message_reactions;
create policy "reactions_insert_self" on public.message_reactions
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id
      where m.id = message_reactions.message_id and cm.user_id = auth.uid())
  );
drop policy if exists "reactions_delete_self" on public.message_reactions;
create policy "reactions_delete_self" on public.message_reactions
  for delete to authenticated using (user_id = auth.uid());

-- attachments
drop policy if exists "attachments_select_member" on public.attachments;
create policy "attachments_select_member" on public.attachments
  for select to authenticated using (
    owner_id = auth.uid()
    or exists (select 1 from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id
      where m.id = attachments.message_id and cm.user_id = auth.uid())
  );
drop policy if exists "attachments_insert_self" on public.attachments;
create policy "attachments_insert_self" on public.attachments
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "attachments_delete_owner" on public.attachments;
create policy "attachments_delete_owner" on public.attachments
  for delete to authenticated using (owner_id = auth.uid());

-- communities
drop policy if exists "communities_select_public" on public.communities;
create policy "communities_select_public" on public.communities
  for select to authenticated using (
    is_public = true
    or exists (select 1 from public.community_members cm
      where cm.community_id = communities.id and cm.user_id = auth.uid())
  );
drop policy if exists "communities_insert_self" on public.communities;
create policy "communities_insert_self" on public.communities
  for insert to authenticated with check (auth.uid() = owner_id);
drop policy if exists "communities_update_owner" on public.communities;
create policy "communities_update_owner" on public.communities
  for update to authenticated using (
    auth.uid() = owner_id
    or exists (select 1 from public.community_members cm
      where cm.community_id = communities.id and cm.user_id = auth.uid()
        and cm.role in ('owner','admin'))
  );
drop policy if exists "communities_delete_owner" on public.communities;
create policy "communities_delete_owner" on public.communities
  for delete to authenticated using (auth.uid() = owner_id);

-- community_members
drop policy if exists "com_members_select_member" on public.community_members;
create policy "com_members_select_member" on public.community_members
  for select to authenticated using (
    exists (select 1 from public.community_members cm
      where cm.community_id = community_members.community_id and cm.user_id = auth.uid())
    or exists (select 1 from public.communities c
      where c.id = community_members.community_id and c.is_public = true)
  );
drop policy if exists "com_members_insert_self" on public.community_members;
create policy "com_members_insert_self" on public.community_members
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "com_members_update_admin" on public.community_members;
create policy "com_members_update_admin" on public.community_members
  for update to authenticated using (
    exists (select 1 from public.community_members cm
      where cm.community_id = community_members.community_id and cm.user_id = auth.uid()
        and cm.role in ('owner','admin','moderator'))
  );
drop policy if exists "com_members_delete_self_or_admin" on public.community_members;
create policy "com_members_delete_self_or_admin" on public.community_members
  for delete to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.community_members cm
      where cm.community_id = community_members.community_id and cm.user_id = auth.uid()
        and cm.role in ('owner','admin','moderator'))
  );

-- channels
drop policy if exists "channels_select_member" on public.channels;
create policy "channels_select_member" on public.channels
  for select to authenticated using (
    exists (select 1 from public.community_members cm
      where cm.community_id = channels.community_id and cm.user_id = auth.uid())
    or exists (select 1 from public.communities c
      where c.id = channels.community_id and c.is_public = true)
  );
drop policy if exists "channels_insert_admin" on public.channels;
create policy "channels_insert_admin" on public.channels
  for insert to authenticated with check (
    exists (select 1 from public.community_members cm
      where cm.community_id = channels.community_id and cm.user_id = auth.uid()
        and cm.role in ('owner','admin'))
  );
drop policy if exists "channels_update_admin" on public.channels;
create policy "channels_update_admin" on public.channels
  for update to authenticated using (
    exists (select 1 from public.community_members cm
      where cm.community_id = channels.community_id and cm.user_id = auth.uid()
        and cm.role in ('owner','admin'))
  );
drop policy if exists "channels_delete_admin" on public.channels;
create policy "channels_delete_admin" on public.channels
  for delete to authenticated using (
    exists (select 1 from public.community_members cm
      where cm.community_id = channels.community_id and cm.user_id = auth.uid()
        and cm.role in ('owner','admin'))
  );

-- channel_messages
drop policy if exists "ch_msgs_select_member" on public.channel_messages;
create policy "ch_msgs_select_member" on public.channel_messages
  for select to authenticated using (
    exists (select 1 from public.community_members cm
      join public.channels ch on ch.community_id = cm.community_id
      where ch.id = channel_messages.channel_id and cm.user_id = auth.uid())
  );
drop policy if exists "ch_msgs_insert_member" on public.channel_messages;
create policy "ch_msgs_insert_member" on public.channel_messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and exists (select 1 from public.community_members cm
      join public.channels ch on ch.community_id = cm.community_id
      where ch.id = channel_messages.channel_id and cm.user_id = auth.uid())
  );
drop policy if exists "ch_msgs_update_sender" on public.channel_messages;
create policy "ch_msgs_update_sender" on public.channel_messages
  for update to authenticated using (sender_id = auth.uid());
drop policy if exists "ch_msgs_delete_sender_or_mod" on public.channel_messages;
create policy "ch_msgs_delete_sender_or_mod" on public.channel_messages
  for delete to authenticated using (
    sender_id = auth.uid()
    or exists (select 1 from public.community_members cm
      join public.channels ch on ch.community_id = cm.community_id
      where ch.id = channel_messages.channel_id and cm.user_id = auth.uid()
        and cm.role in ('owner','admin','moderator'))
  );

-- roles
drop policy if exists "roles_select_member" on public.roles;
create policy "roles_select_member" on public.roles
  for select to authenticated using (
    exists (select 1 from public.community_members cm
      where cm.community_id = roles.community_id and cm.user_id = auth.uid())
  );
drop policy if exists "roles_insert_admin" on public.roles;
create policy "roles_insert_admin" on public.roles
  for insert to authenticated with check (
    exists (select 1 from public.community_members cm
      where cm.community_id = roles.community_id and cm.user_id = auth.uid()
        and cm.role in ('owner','admin'))
  );
drop policy if exists "roles_update_admin" on public.roles;
create policy "roles_update_admin" on public.roles
  for update to authenticated using (
    exists (select 1 from public.community_members cm
      where cm.community_id = roles.community_id and cm.user_id = auth.uid()
        and cm.role in ('owner','admin'))
  );
drop policy if exists "roles_delete_admin" on public.roles;
create policy "roles_delete_admin" on public.roles
  for delete to authenticated using (
    exists (select 1 from public.community_members cm
      where cm.community_id = roles.community_id and cm.user_id = auth.uid()
        and cm.role in ('owner','admin'))
  );

-- calls
drop policy if exists "calls_select_participant" on public.calls;
create policy "calls_select_participant" on public.calls
  for select to authenticated using (
    initiated_by = auth.uid()
    or exists (select 1 from public.call_participants cp
      where cp.call_id = calls.id and cp.user_id = auth.uid())
    or exists (select 1 from public.conversation_members cm
      where cm.conversation_id = calls.conversation_id and cm.user_id = auth.uid())
    or exists (select 1 from public.community_members cm
      join public.channels ch on ch.community_id = cm.community_id
      where ch.id = calls.channel_id and cm.user_id = auth.uid())
  );
drop policy if exists "calls_insert_self" on public.calls;
create policy "calls_insert_self" on public.calls
  for insert to authenticated with check (initiated_by = auth.uid());
drop policy if exists "calls_update_initiator" on public.calls;
create policy "calls_update_initiator" on public.calls
  for update to authenticated using (initiated_by = auth.uid());

-- call_participants
drop policy if exists "call_parts_select" on public.call_participants;
create policy "call_parts_select" on public.call_participants
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.calls c
      where c.id = call_participants.call_id
        and (c.initiated_by = auth.uid()
             or exists (select 1 from public.conversation_members cm
               where cm.conversation_id = c.conversation_id and cm.user_id = auth.uid())))
  );
drop policy if exists "call_parts_insert_self" on public.call_participants;
create policy "call_parts_insert_self" on public.call_participants
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "call_parts_update_self" on public.call_participants;
create policy "call_parts_update_self" on public.call_participants
  for update to authenticated using (user_id = auth.uid());

-- call_signaling
drop policy if exists "signaling_select_to" on public.call_signaling;
create policy "signaling_select_to" on public.call_signaling
  for select to authenticated using (to_user = auth.uid() or from_user = auth.uid());
drop policy if exists "signaling_insert_from" on public.call_signaling;
create policy "signaling_insert_from" on public.call_signaling
  for insert to authenticated with check (from_user = auth.uid());
drop policy if exists "signaling_delete_old" on public.call_signaling;
create policy "signaling_delete_old" on public.call_signaling
  for delete to authenticated using (true);

-- friendships
drop policy if exists "friendships_select_party" on public.friendships;
create policy "friendships_select_party" on public.friendships
  for select to authenticated using (
    requester_id = auth.uid() or addressee_id = auth.uid()
  );
drop policy if exists "friendships_insert_requester" on public.friendships;
create policy "friendships_insert_requester" on public.friendships
  for insert to authenticated with check (requester_id = auth.uid());
drop policy if exists "friendships_update_addressee" on public.friendships;
create policy "friendships_update_addressee" on public.friendships
  for update to authenticated using (addressee_id = auth.uid());
drop policy if exists "friendships_delete_party" on public.friendships;
create policy "friendships_delete_party" on public.friendships
  for delete to authenticated using (
    requester_id = auth.uid() or addressee_id = auth.uid()
  );

-- blocks
drop policy if exists "blocks_select_blocker" on public.blocks;
create policy "blocks_select_blocker" on public.blocks
  for select to authenticated using (blocker_id = auth.uid());
drop policy if exists "blocks_insert_self" on public.blocks;
create policy "blocks_insert_self" on public.blocks
  for insert to authenticated with check (blocker_id = auth.uid());
drop policy if exists "blocks_delete_self" on public.blocks;
create policy "blocks_delete_self" on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- notifications
drop policy if exists "notifs_select_self" on public.notifications;
create policy "notifs_select_self" on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "notifs_insert_self" on public.notifications;
create policy "notifs_insert_self" on public.notifications
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "notifs_update_self" on public.notifications;
create policy "notifs_update_self" on public.notifications
  for update to authenticated using (user_id = auth.uid());
drop policy if exists "notifs_delete_self" on public.notifications;
create policy "notifs_delete_self" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- typing
drop policy if exists "typing_select_member" on public.typing;
create policy "typing_select_member" on public.typing
  for select to authenticated using (
    exists (select 1 from public.conversation_members cm
      where cm.conversation_id = typing.conversation_id and cm.user_id = auth.uid())
  );
drop policy if exists "typing_upsert_self" on public.typing;
create policy "typing_upsert_self" on public.typing
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "typing_update_self" on public.typing;
create policy "typing_update_self" on public.typing
  for update to authenticated using (user_id = auth.uid());
drop policy if exists "typing_delete_self" on public.typing;
create policy "typing_delete_self" on public.typing
  for delete to authenticated using (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════
-- STORAGE BUCKETS (ON CONFLICT DO NOTHING — safe to re-run)
-- ════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('community-assets', 'community-assets', true)
on conflict (id) do nothing;

-- Storage RLS: avatars bucket
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_auth_insert" on storage.objects;
create policy "avatars_auth_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage RLS: attachments bucket
drop policy if exists "attachments_select_member" on storage.objects;
create policy "attachments_select_member" on storage.objects
  for select to authenticated using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "attachments_insert_owner" on storage.objects;
create policy "attachments_insert_owner" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "attachments_delete_owner" on storage.objects;
create policy "attachments_delete_owner" on storage.objects
  for delete to authenticated using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage RLS: community-assets bucket
drop policy if exists "community_assets_public_read" on storage.objects;
create policy "community_assets_public_read" on storage.objects
  for select using (bucket_id = 'community-assets');

drop policy if exists "community_assets_member_insert" on storage.objects;
create policy "community_assets_member_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'community-assets'
  );

drop policy if exists "community_assets_owner_delete" on storage.objects;
create policy "community_assets_owner_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'community-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ════════════════════════════════════════════════════════════════════
-- REALTIME PUBLATION — IDEMPOTENT
-- Wraps each `alter publication add table` in a DO block that checks
-- if the table is already a member. THIS is what was failing before.
-- ════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t_name text;
  t_schema text := 'public';
BEGIN
  FOREACH t_name IN ARRAY ARRAY[
    'messages','channel_messages','conversations','conversation_members',
    'message_reactions','typing','call_signaling','call_participants',
    'calls','notifications','friendships','community_members','channels','profiles'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = t_schema
        AND tablename = t_name
    ) THEN
      EXECUTE format('alter publication supabase_realtime add table %I.%I', t_schema, t_name);
    END IF;
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════
-- DONE. Verify with:
--   select tablename from pg_tables where schemaname='public' order by tablename;
--   select policyname, tablename from pg_policies where schemaname='public' order by tablename;
-- ════════════════════════════════════════════════════════════════════
