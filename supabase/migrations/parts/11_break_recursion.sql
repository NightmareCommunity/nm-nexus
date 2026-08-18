-- Break the mutual recursion between communities and community_members policies.
-- Use the SECURITY DEFINER function is_community_member() which bypasses RLS at runtime.

drop policy if exists communities_select_public on public.communities;
create policy communities_select_public on public.communities
  for select using (
    is_public = true
    or owner_id = auth.uid()
    or public.is_community_member(id)
  );

drop policy if exists communities_update_owner on public.communities;
create policy communities_update_owner on public.communities
  for update using (
    owner_id = auth.uid()
    or public.is_community_admin(id)
  );

-- Simplify community_members_select to NOT reference communities (breaks cycle)
drop policy if exists community_members_select on public.community_members;
create policy community_members_select on public.community_members
  for select using (
    user_id = auth.uid()
    or public.is_community_member(community_id)
  );
