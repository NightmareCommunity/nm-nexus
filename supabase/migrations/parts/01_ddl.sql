-- Part 1: DDL only — tables, columns, indexes (no functions, no RLS)
-- Safe to run multiple times.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- 1. community_invites
create table if not exists public.community_invites (
  id uuid primary key default uuid_generate_v4(),
  community_id uuid not null references public.communities(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete set null,
  max_uses integer,
  uses integer not null default 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists community_invites_community_idx on public.community_invites(community_id);
create index if not exists community_invites_code_idx on public.community_invites(code);

-- 2. read_states
create table if not exists public.read_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  last_read_message_id uuid,
  last_read_at timestamptz not null default now(),
  constraint read_states_chk check (
    (channel_id is not null and conversation_id is null) or
    (channel_id is null and conversation_id is not null)
  ),
  constraint read_states_pk primary key (user_id, channel_id, conversation_id)
);
create index if not exists read_states_user_idx on public.read_states(user_id);

-- 3. voice_states
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
  constraint voice_states_pk primary key (user_id)
);
create index if not exists voice_states_channel_idx on public.voice_states(channel_id);

-- 4. pinned_messages
create table if not exists public.pinned_messages (
  channel_id uuid not null references public.channels(id) on delete cascade,
  message_id uuid not null references public.channel_messages(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete set null,
  pinned_at timestamptz not null default now(),
  constraint pinned_messages_pk primary key (channel_id, message_id)
);

-- 5. audit_log
create table if not exists public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  community_id uuid not null references public.communities(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_community_idx on public.audit_log(community_id, created_at desc);

-- 6. web_push_subscriptions
create table if not exists public.web_push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- 7. message_edits
create table if not exists public.message_edits (
  id uuid primary key default uuid_generate_v4(),
  message_id uuid not null references public.channel_messages(id) on delete cascade,
  conversation_message_id uuid references public.messages(id) on delete cascade,
  old_body text,
  edited_by uuid not null references auth.users(id) on delete set null,
  edited_at timestamptz not null default now()
);
create index if not exists message_edits_msg_idx on public.message_edits(message_id);

-- 8. channel_categories
create table if not exists public.channel_categories (
  id uuid primary key default uuid_generate_v4(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists channel_categories_community_idx on public.channel_categories(community_id, position);

-- 9. Extra columns on existing tables
alter table public.channels add column if not exists category_id uuid references public.channel_categories(id) on delete set null;
alter table public.channels add column if not exists is_private boolean not null default false;
alter table public.channels add column if not exists nsfw boolean not null default false;
alter table public.channels add column if not exists slowmode_seconds integer not null default 0;

alter table public.communities add column if not exists vanity_url text;
alter table public.communities add column if not exists member_count integer not null default 0;
alter table public.communities add column if not exists is_verified boolean not null default false;

alter table public.community_members add column if not exists last_visited_at timestamptz not null default now();
alter table public.community_members add column if not exists notifications_enabled boolean not null default true;

alter table public.channel_messages add column if not exists mentions uuid[] default '{}';
alter table public.channel_messages add column if not exists is_pinned boolean not null default false;

alter table public.messages add column if not exists mentions uuid[] default '{}';

alter table public.profiles add column if not exists discriminator text not null default '0001';
alter table public.profiles add column if not exists pronouns text;
alter table public.profiles add column if not exists banner text;
alter table public.profiles add column if not exists accent_color text default '#a855f7';

drop index if exists profiles_username_discriminator_idx;
create unique index if not exists profiles_username_discriminator_idx
  on public.profiles (username, discriminator);

-- 10. Enable RLS on all new tables
alter table public.community_invites enable row level security;
alter table public.read_states enable row level security;
alter table public.voice_states enable row level security;
alter table public.pinned_messages enable row level security;
alter table public.audit_log enable row level security;
alter table public.web_push_subscriptions enable row level security;
alter table public.message_edits enable row level security;
alter table public.channel_categories enable row level security;
