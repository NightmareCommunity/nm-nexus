'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { createClient } from '@/lib/supabase/client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Hash, Volume2, Search, Plus, ChevronDown, ChevronRight, Settings, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Database } from '@/lib/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Conversation = Database['public']['Tables']['conversations']['Row'];
type Channel = Database['public']['Tables']['channels']['Row'];
type Community = Database['public']['Tables']['communities']['Row'];

export function ChannelSidebar() {
  const { user, profile } = useAuthStore();
  const {
    activeView, activeCommunityId, activeConversationId, activeChannelId,
    setActiveConversation, setActiveChannel, setActiveView, setActiveCommunity,
    setMobileSheetOpen,
  } = useUIStore();
  console.log('ChannelSidebar render:', { activeView, activeCommunityId, activeChannelId, activeConversationId });
  const [search, setSearch] = useState('');
  const [dmList, setDmList] = useState<(Conversation & { other_user?: Profile; last_message?: string })[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [expandedCommunities, setExpandedCommunities] = useState<Set<string>>(new Set());
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});

  const loadAll = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();

    // DMs: get conversations where user is a member, plus the other participant's profile
    const { data: memberships } = await supabase
      .from('conversation_members')
      .select('conversation_id, last_read_message_id')
      .eq('user_id', user.id);

    const convIds = (memberships || []).map((m) => m.conversation_id);
    if (convIds.length === 0) {
      setDmList([]);
    } else {
      const { data: convs } = await supabase
        .from('conversations')
        .select('*')
        .in('id', convIds)
        .order('updated_at', { ascending: false });

      // For each DM conversation, get the other participant's profile
      const dmPromises = (convs || []).map(async (c) => {
        const { data: members } = await supabase
          .from('conversation_members')
          .select('user_id, profiles!inner(*)')
          .eq('conversation_id', c.id)
          .neq('user_id', user.id);
        const otherUser = members?.[0]?.profiles as unknown as Profile;
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('plaintext_body, created_at')
          .eq('conversation_id', c.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return { ...c, other_user: otherUser, last_message: lastMsg?.plaintext_body || '' };
      });
      const dms = await Promise.all(dmPromises);
      setDmList(dms);
    }

    // Communities + their channels
    const { data: myCommunities, error: comErr } = await supabase
      .from('community_members')
      .select('community_id, communities!inner(*)')
      .eq('user_id', user.id);
    if (comErr) console.warn('community load err', comErr);
    const comms = (myCommunities || []).map((m: any) => m.communities as Community);
    setCommunities(comms);

    // If a community is active, load its channels
    const targetCommunityId = activeCommunityId || comms[0]?.id;
    console.log('ChannelSidebar loadAll:', { activeCommunityId, commsCount: comms.length, targetCommunityId, firstCommId: comms[0]?.id });
    if (targetCommunityId) {
      const { data: chans, error: chanErr } = await supabase
        .from('channels')
        .select('*')
        .eq('community_id', targetCommunityId)
        .order('position', { ascending: true });
      console.log('channels query result:', { count: chans?.length, err: chanErr?.message });
      if (chanErr) console.warn('channels load err', chanErr);
      setChannels(chans || []);
      setActiveCommunity(targetCommunityId);
    }
  }, [user, activeCommunityId, setActiveCommunity]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Realtime subscriptions for new messages (updates last-message preview + unread)
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel('sidebar-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => { loadAll(); }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'channel_messages' },
        () => { loadAll(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadAll]);

  const filteredDms = dmList.filter((d) => {
    if (!search) return true;
    const name = d.other_user?.display_name || d.other_user?.username || '';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  // Determine what to show based on activeView
  const showDmList = activeView === 'dms' || activeView === 'home' || activeConversationId !== null;
  const showCommunityList = activeView === 'communities' || activeChannelId !== null;

  return (
    <aside className="w-60 shrink-0 flex flex-col bg-[#13101a] border-r border-white/5">
      {/* Header */}
      <div className="h-12 px-3 flex items-center border-b border-white/5 shadow-sm">
        <span className="text-sm font-semibold text-white truncate">
          {showCommunityList && activeCommunityId
            ? communities.find((c) => c.id === activeCommunityId)?.name || 'Community'
            : 'Direct Messages'}
        </span>
        <button
          className="ml-auto p-1 rounded hover:bg-white/5"
          onClick={() => { /* settings */ }}
        >
          <Settings className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Search */}
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={showCommunityList ? 'Find channel' : 'Find or start a conversation'}
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded bg-[#0a0810] border border-white/5 placeholder:text-muted-foreground focus:outline-none focus:border-nexus-violet/50"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-2 pb-2">
        {/* Community channels */}
        {showCommunityList && (
          <div className="space-y-0.5">
            {channels.map((ch) => {
              const isActive = activeChannelId === ch.id;
              return (
                <button
                  key={ch.id}
                  onClick={() => setActiveChannel(ch.id, activeCommunityId)}
                  className={cn(
                    'w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm group',
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-muted-foreground hover:bg-white/5 hover:text-white/80'
                  )}
                >
                  {ch.type === 'voice' ? (
                    <Volume2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <Hash className="h-4 w-4 shrink-0" />
                  )}
                  <span className="truncate">{ch.name}</span>
                </button>
              );
            })}
            {channels.length === 0 && (
              <p className="text-xs text-muted-foreground/60 px-2 py-4 text-center">
                No channels yet.
              </p>
            )}
            <button
              onClick={() => toast.info('Channel creation — coming next iteration')}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-muted-foreground hover:bg-white/5 hover:text-white/80"
            >
              <Plus className="h-3 w-3" />
              Create channel
            </button>
          </div>
        )}

        {/* DM list */}
        {showDmList && (
          <>
            <div className="flex items-center justify-between px-2 py-1 mt-2">
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                Direct Messages
              </span>
              <button
                onClick={() => setActiveView('friends')}
                className="p-0.5 rounded hover:bg-white/5"
                aria-label="New DM"
              >
                <Plus className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-0.5">
              {filteredDms.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 px-2 py-4 text-center">
                  No conversations yet.
                  <br />
                  Find someone in Friends to start one.
                </p>
              ) : (
                filteredDms.map((dm) => {
                  const isActive = activeConversationId === dm.id;
                  const other = dm.other_user;
                  const initials = (other?.display_name || other?.username || 'U').slice(0, 2).toUpperCase();
                  return (
                    <button
                      key={dm.id}
                      onClick={() => setActiveConversation(dm.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm group',
                        isActive
                          ? 'bg-white/10 text-white'
                          : 'text-muted-foreground hover:bg-white/5 hover:text-white/80'
                      )}
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-7 w-7">
                          {other?.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={other.avatar} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <AvatarFallback
                              className="text-[10px]"
                              style={{ backgroundColor: other?.avatar_color || '#7c3aed', color: 'white' }}
                            >
                              {initials}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <div className={cn(
                          'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#13101a]',
                          other?.status === 'online' ? 'bg-green-500' : 'bg-gray-500'
                        )} />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="truncate text-xs font-medium">
                          {other?.display_name || other?.username || 'Unknown'}
                        </div>
                        {dm.last_message && (
                          <div className="truncate text-[10px] text-muted-foreground/70">
                            {dm.last_message}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </ScrollArea>

      {/* User mini-bar (mobile also sees this) */}
      {profile && (
        <div className="h-12 px-2 flex items-center gap-2 border-t border-white/5 bg-[#0a0810]">
          <Avatar className="h-7 w-7 shrink-0">
            {profile.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <AvatarFallback
                className="text-[10px]"
                style={{ backgroundColor: profile.avatar_color || '#7c3aed', color: 'white' }}
              >
                {(profile.display_name || profile.username || 'U').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{profile.display_name || profile.username}</div>
            <div className="text-[10px] text-green-500">● Online</div>
          </div>
          <button
            onClick={() => setMobileSheetOpen('settings')}
            className="p-1.5 rounded hover:bg-white/10"
            aria-label="Settings"
          >
            <Settings className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      )}
    </aside>
  );
}
