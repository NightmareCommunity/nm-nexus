-- ════════════════════════════════════════════════════════════════════
-- NM NEXUS — Storage Buckets & Policies (RUN IN SUPABASE DASHBOARD)
-- ════════════════════════════════════════════════════════════════════
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
--
-- This creates the storage buckets used by NM NEXUS:
--   1. avatars     — public, user profile pictures (1MB limit)
--   2. attachments — private, message attachments (25MB limit)
--   3. community-icons — public, server icons (1MB limit)
-- ════════════════════════════════════════════════════════════════════

-- ───────── 1. AVATARS BUCKET (public) ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  1048576,  -- 1 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) on conflict (id) do nothing;

-- Anyone can read avatars (they're public)
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Users can upload/update/delete ONLY their own avatar (folder = their user id)
drop policy if exists "avatars_own_insert" on storage.objects;
create policy "avatars_own_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_own_update" on storage.objects;
create policy "avatars_own_update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_own_delete" on storage.objects;
create policy "avatars_own_delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ───────── 2. ATTACHMENTS BUCKET (private) ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,  -- private — only accessible via signed URL or by owner
  26214400,  -- 25 MB
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm',
    'audio/mpeg', 'audio/ogg', 'audio/wav',
    'application/pdf',
    'text/plain',
    'application/zip'
  ]
) on conflict (id) do nothing;

-- Users can read attachments in their own folder
drop policy if exists "attachments_owner_read" on storage.objects;
create policy "attachments_owner_read"
  on storage.objects for select
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can upload attachments to their own folder
drop policy if exists "attachments_owner_insert" on storage.objects;
create policy "attachments_owner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update their own attachments
drop policy if exists "attachments_owner_update" on storage.objects;
create policy "attachments_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own attachments
drop policy if exists "attachments_owner_delete" on storage.objects;
create policy "attachments_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ───────── 3. COMMUNITY ICONS BUCKET (public) ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-icons',
  'community-icons',
  true,
  1048576,  -- 1 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) on conflict (id) do nothing;

-- Anyone can read community icons
drop policy if exists "community_icons_public_read" on storage.objects;
create policy "community_icons_public_read"
  on storage.objects for select
  using (bucket_id = 'community-icons');

-- Only community owners can upload icons (we check via community_members)
-- For simplicity, allow any authenticated user to upload to their own folder
drop policy if exists "community_icons_owner_insert" on storage.objects;
create policy "community_icons_owner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'community-icons'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "community_icons_owner_update" on storage.objects;
create policy "community_icons_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'community-icons'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "community_icons_owner_delete" on storage.objects;
create policy "community_icons_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'community-icons'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ════════════════════════════════════════════════════════════════════
-- DONE — storage buckets are ready.
-- Verify by running: select id, name, public from storage.buckets;
-- ════════════════════════════════════════════════════════════════════
