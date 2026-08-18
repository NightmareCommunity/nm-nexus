-- RPC: create_community_with_defaults
-- Uses $func$ tag to avoid $$ conflicts in splitter

create or replace function public.create_community_with_defaults(
  p_name text,
  p_description text default null,
  p_icon text default null,
  p_is_public boolean default true
) returns uuid
language plpgsql
security definer
as $func$
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

  v_slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if char_length(v_slug) < 2 then
    v_slug := 'community-' || substr(md5(random()::text), 1, 6);
  end if;

  while exists (select 1 from public.communities where slug = v_slug) loop
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
  end loop;

  v_code := substr(md5(random()::text || v_owner_id::text), 1, 8);
  while exists (select 1 from public.community_invites where code = v_code) loop
    v_code := substr(md5(random()::text || v_owner_id::text), 1, 8);
  end loop;

  insert into public.communities (owner_id, name, slug, description, icon, is_public, invite_code)
  values (v_owner_id, p_name, v_slug, p_description, p_icon, p_is_public, v_code)
  returning id into v_community_id;

  insert into public.community_members (community_id, user_id, role)
  values (v_community_id, v_owner_id, 'owner');

  update public.communities set member_count = 1 where id = v_community_id;

  insert into public.channel_categories (community_id, name, position)
  values (v_community_id, 'INFORMATION', 0)
  returning id into v_cat_info;

  insert into public.channel_categories (community_id, name, position)
  values (v_community_id, 'TEXT CHANNELS', 1)
  returning id into v_cat_chat;

  insert into public.channel_categories (community_id, name, position)
  values (v_community_id, 'VOICE CHANNELS', 2)
  returning id into v_cat_voice;

  insert into public.channels (community_id, name, type, position, category_id)
  values
    (v_community_id, 'announcements', 'text', 0, v_cat_info),
    (v_community_id, 'rules', 'text', 1, v_cat_info),
    (v_community_id, 'general', 'text', 0, v_cat_chat),
    (v_community_id, 'media', 'text', 1, v_cat_chat),
    (v_community_id, 'Lounge', 'voice', 0, v_cat_voice);

  insert into public.roles (community_id, name, color, permissions, position)
  values
    (v_community_id, '@everyone', '#94a3b8', '{}'::jsonb, 0),
    (v_community_id, 'Owner', '#fbbf24',
     '{"admin":true,"manage_channels":true,"manage_members":true,"manage_messages":true,"manage_roles":true,"mention_all":true,"view_channel":true,"send_messages":true,"attach_files":true,"add_reactions":true,"connect_voice":true,"speak":true}'::jsonb,
     100);

  insert into public.community_invites (community_id, code, created_by, max_uses)
  values (v_community_id, v_code, v_owner_id, null);

  return v_community_id;
end;
$func$;
