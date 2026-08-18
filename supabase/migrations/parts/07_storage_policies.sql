-- Storage bucket policies (drop+create — idempotent)

-- Avatars: public read; owner write to their own folder
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

-- Attachments: any authenticated user can read; owner can write
drop policy if exists attachments_read on storage.objects;
create policy attachments_read on storage.objects
  for select using (bucket_id = 'attachments' and auth.uid() is not null);

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

-- Community icons (both naming conventions)
drop policy if exists community_icons_read on storage.objects;
create policy community_icons_read on storage.objects
  for select using (bucket_id in ('community_icons', 'community-icons'));

drop policy if exists community_icons_write on storage.objects;
create policy community_icons_write on storage.objects
  for insert with check (
    bucket_id in ('community_icons', 'community-icons')
    and auth.uid() is not null
  );

drop policy if exists community_icons_update on storage.objects;
create policy community_icons_update on storage.objects
  for update using (
    bucket_id in ('community_icons', 'community-icons')
    and auth.uid() is not null
  );

drop policy if exists community_icons_delete on storage.objects;
create policy community_icons_delete on storage.objects
  for delete using (
    bucket_id in ('community_icons', 'community-icons')
    and auth.uid() is not null
  );

-- Community assets (banners etc.)
drop policy if exists community_assets_read on storage.objects;
create policy community_assets_read on storage.objects
  for select using (bucket_id in ('community_assets', 'community-assets'));

drop policy if exists community_assets_write on storage.objects;
create policy community_assets_write on storage.objects
  for insert with check (
    bucket_id in ('community_assets', 'community-assets')
    and auth.uid() is not null
  );

drop policy if exists community_assets_delete on storage.objects;
create policy community_assets_delete on storage.objects
  for delete using (
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

drop policy if exists voice_messages_delete on storage.objects;
create policy voice_messages_delete on storage.objects
  for delete using (
    bucket_id = 'voice_messages'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
