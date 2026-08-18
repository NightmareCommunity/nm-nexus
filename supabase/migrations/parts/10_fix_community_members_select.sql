-- Restructure community_members_select to avoid self-reference.
-- The is_community_member() function still works for OTHER tables (channels, etc.)
-- because those tables don't have the recursion issue.

drop policy if exists community_members_select on public.community_members;
create policy community_members_select on public.community_members
  for select using (
    -- I can always see my own memberships
    user_id = auth.uid()
    -- Anyone can see members of public communities
    or exists (
      select 1 from public.communities c
      where c.id = community_members.community_id and c.is_public = true
    )
    -- Owners can see all members of their communities
    or exists (
      select 1 from public.communities c
      where c.id = community_members.community_id and c.owner_id = auth.uid()
    )
  );

-- Grant execute on the helper functions (already done, but re-grant to be safe)
grant execute on function public.is_community_member(uuid) to anon, authenticated;
grant execute on function public.is_community_admin(uuid) to anon, authenticated;
grant execute on function public.is_community_moderator(uuid) to anon, authenticated;
