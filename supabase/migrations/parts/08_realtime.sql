-- Add all tables to supabase_realtime publication for live updates
do $func$
begin
  begin alter publication supabase_realtime add table public.community_invites; exception when others then null; end;
  begin alter publication supabase_realtime add table public.read_states; exception when others then null; end;
  begin alter publication supabase_realtime add table public.voice_states; exception when others then null; end;
  begin alter publication supabase_realtime add table public.pinned_messages; exception when others then null; end;
  begin alter publication supabase_realtime add table public.channel_categories; exception when others then null; end;
  begin alter publication supabase_realtime add table public.message_edits; exception when others then null; end;
  begin alter publication supabase_realtime add table public.channel_messages; exception when others then null; end;
  begin alter publication supabase_realtime add table public.messages; exception when others then null; end;
  begin alter publication supabase_realtime add table public.message_reactions; exception when others then null; end;
  begin alter publication supabase_realtime add table public.conversations; exception when others then null; end;
  begin alter publication supabase_realtime add table public.conversation_members; exception when others then null; end;
  begin alter publication supabase_realtime add table public.communities; exception when others then null; end;
  begin alter publication supabase_realtime add table public.community_members; exception when others then null; end;
  begin alter publication supabase_realtime add table public.channels; exception when others then null; end;
  begin alter publication supabase_realtime add table public.friendships; exception when others then null; end;
  begin alter publication supabase_realtime add table public.typing; exception when others then null; end;
  begin alter publication supabase_realtime add table public.profiles; exception when others then null; end;
  begin alter publication supabase_realtime add table public.calls; exception when others then null; end;
  begin alter publication supabase_realtime add table public.call_signaling; exception when others then null; end;
  begin alter publication supabase_realtime add table public.notifications; exception when others then null; end;
end
$func$;
