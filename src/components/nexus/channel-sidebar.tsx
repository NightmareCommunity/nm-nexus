'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { createClient } from '@/lib/supabase/client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Hash, Volume2, Search, Plus, ChevronDown, ChevronRight, Settings,
  Users, X, Server, Compass, UserPlus, LogOut, Copy, Trash2, Pencil,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
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
    setMobileSheetOpen, setRightPanelOpen,
  } = useUIStore();

  const [search, setSearch] = useState('');
  const [dmList, setDmList] = useState<(Conversation & { other_user?: Profile; last_message?: string })[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [collapsedCommunities, setCollapsedCommunities] = useState<Set<string>>(new Set());
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');
  const [creatingChannel, setCreatingChannel] = useState(false);

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

      // For each DM conversation, get the other participant's profile + last message preview
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
    if (targetCommunityId) {
      const { data: chans, error: chanErr } = await supabase
        .from('channels')
        .select('*')
        .eq('community_id', targetCommunityId)
        .order('position', { ascending: true });
      if (chanErr) console.warn('channels load err', chanErr);
      setChannels(chans || []);
      if (!activeCommunityId) setActiveCommunity(targetCommunityId);
    }
  }, [user, activeCommunityId, setActiveCommunity]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Realtime subscriptions for new messages (updates last-message preview)
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
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'channels' },
        () => { loadAll(); }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations' },
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

  const showDmList = activeView === 'dms' || activeView === 'home' || activeConversationId !== null;
  const showCommunityList = activeView === 'communities' || activeChannelId !== null;

  const activeCommunity = communities.find((c) => c.id === activeCommunityId);
  const textChannels = channels.filter((c) => c.type !== 'voice');
  const voiceChannels = channels.filter((c) => c.type === 'voice');

  const createChannel = async () => {
    if (!user || !activeCommunityId || !newChannelName.trim()) return;
    setCreatingChannel(true);
    try {
      const supabase = createClient();
      const name = newChannelName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
      if (!name) {
        toast.error('Channel name must contain letters or numbers');
        setCreatingChannel(false);
        return;
      }
      const { data, error } = await supabase
        .from('channels')
        .insert({
          community_id: activeCommunityId,
          name,
          type: newChannelType,
          position: channels.length,
        })
        .select()
        .single();
      if (error) throw error;
      toast.success(`Created #${name}`);
      setCreateChannelOpen(false);
      setNewChannelName('');
      loadAll();
      setActiveChannel(data.id, activeCommunityId);
    } catch (e: any) {
      toast.error(`Failed to create channel: ${e.message}`);
    } finally {
      setCreatingChannel(false);
    }
  };

  const leaveCommunity = async () => {
    if (!user || !activeCommunityId) return;
    const supabase = createClient();
    await supabase.from('community_members')
      .delete()
      .eq('community_id', activeCommunityId)
      .eq('user_id', user.id);
    toast.success('Left community');
    setActiveChannel(null);
    setActiveCommunity(null);
    setActiveView('communities');
    loadAll();
  };

  const copyInvite = async () => {
    if (!activeCommunity) return;
    const code = activeCommunity.invite_code || activeCommunity.slug;
    await navigator.clipboard.writeText(code || '');
    toast.success(`Invite code copied: ${code}`);
  };

  return (
    <aside className="w-60 shrink-0 flex flex-col bg-[#13101a] border-r border-white/5">
      {/* Header — community name with dropdown */}
      <div className="h-12 px-3 flex items-center border-b border-white/5 shadow-sm shrink-0">
        {showCommunityList && activeCommunity ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex-1 flex items-center justify-between text-left hover:bg-white/5 rounded px-2 -mx-2 h-9">
                <span className="text-sm font-semibold text-white truncate">
                  {activeCommunity.name}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 bg-[#1a1525] border-white/10">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {activeCommunity.name}
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem onClick={copyInvite} className="gap-2 cursor-pointer text-white/90">
                <Copy className="h-3.5 w-3.5" /> Copy invite code
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setRightPanelOpen(true)}
                className="gap-2 cursor-pointer text-white/90"
              >
                <Users className="h-3.5 w-3.5" /> Members
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem
                onClick={leaveCommunity}
                className="gap-2 cursor-pointer text-destructive"
              >
                <LogOut className="h-3.5 w-3.5" /> Leave community
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="text-sm font-semibold text-white truncate">
            Direct Messages
          </span>
        )}
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
        {/* Community channels — Discord-style: TEXT CHANNELS / VOICE CHANNELS sections */}
        {showCommunityList && (
          <div className="space-y-3 pt-1">
            {/* Text Channels section */}
            <div>
              <div className="flex items-center justify-between px-1 mb-0.5">
                <button
                  onClick={() => setCollapsedCommunities((s) => {
                    const n = new Set(s);
                    n.has('text') ? n.delete('text') : n.add('text');
                    return n;
                  })}
                  className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground hover:text-white/80"
                >
                  {collapsedCommunities.has('text') ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  Text Channels
                </button>
                <button
                  onClick={() => { setNewChannelType('text'); setCreateChannelOpen(true); }}
                  className="p-0.5 rounded hover:bg-white/5 text-muted-foreground hover:text-white"
                  aria-label="Create text channel"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              {!collapsedCommunities.has('text') && (
                <div className="space-y-0.5">
                  {textChannels.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground/60 px-2 py-1">
                      No text channels.
                    </p>
                  ) : (
                    textChannels.map((ch) => (
                      <ChannelRow
                        key={ch.id}
                        ch={ch}
                        isActive={activeChannelId === ch.id}
                        onClick={() => setActiveChannel(ch.id, activeCommunityId)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Voice Channels section */}
            <div>
              <div className="flex items-center justify-between px-1 mb-0.5">
                <button
                  onClick={() => setCollapsedCommunities((s) => {
                    const n = new Set(s);
                    n.has('voice') ? n.delete('voice') : n.add('voice');
                    return n;
                  })}
                  className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground hover:text-white/80"
                >
                  {collapsedCommunities.has('voice') ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  Voice Channels
                </button>
                <button
                  onClick={() => { setNewChannelType('voice'); setCreateChannelOpen(true); }}
                  className="p-0.5 rounded hover:bg-white/5 text-muted-foreground hover:text-white"
                  aria-label="Create voice channel"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              {!collapsedCommunities.has('voice') && (
                <div className="space-y-0.5">
                  {voiceChannels.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground/60 px-2 py-1">
                      No voice channels.
                    </p>
                  ) : (
                    voiceChannels.map((ch) => (
                      <ChannelRow
                        key={ch.id}
                        ch={ch}
                        isActive={activeChannelId === ch.id}
                        onClick={() => setActiveChannel(ch.id, activeCommunityId)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // Close DM — leave conversation silently
                          if (user) {
                            const supabase = createClient();
                            supabase.from('conversation_members')
                              .delete()
                              .eq('conversation_id', dm.id)
                              .eq('user_id', user.id)
                              .then(() => { loadAll(); });
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10"
                        aria-label="Close DM"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </ScrollArea>

      {/* User mini-bar */}
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
            <div className="text-[10px] text-green-500 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
              Online
            </div>
          </div>
          <button
            onClick={() => { setActiveView('settings'); }}
            className="p-1.5 rounded hover:bg-white/10"
            aria-label="Settings"
          >
            <Settings className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Create Channel dialog */}
      <Dialog open={createChannelOpen} onOpenChange={setCreateChannelOpen}>
        <DialogContent className="bg-[#13101a] border border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Create Channel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Channel Type</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setNewChannelType('text')}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded-md border text-left',
                    newChannelType === 'text'
                      ? 'border-nexus-violet bg-nexus-violet/10'
                      : 'border-white/10 bg-[#0a0810] hover:border-white/20'
                  )}
                >
                  <Hash className="h-4 w-4 text-nexus-lavender" />
                  <div>
                    <div className="text-xs font-medium text-white">Text</div>
                    <div className="text-[10px] text-muted-foreground">Send messages, images, links</div>
                  </div>
                </button>
                <button
                  onClick={() => setNewChannelType('voice')}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded-md border text-left',
                    newChannelType === 'voice'
                      ? 'border-nexus-violet bg-nexus-violet/10'
                      : 'border-white/10 bg-[#0a0810] hover:border-white/20'
                  )}
                >
                  <Volume2 className="h-4 w-4 text-nexus-lavender" />
                  <div>
                    <div className="text-xs font-medium text-white">Voice</div>
                    <div className="text-[10px] text-muted-foreground">Hang out together with voice</div>
                  </div>
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Channel Name</Label>
              <div className="mt-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {newChannelType === 'voice' ? <Volume2 className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                </span>
                <Input
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                  placeholder="new-channel"
                  className="bg-[#0a0810] border-white/10 pl-9 lowercase"
                  maxLength={32}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newChannelName.trim()) createChannel();
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Lowercase letters, numbers, hyphens. Max 32 chars.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateChannelOpen(false)}>Cancel</Button>
            <Button
              onClick={createChannel}
              disabled={creatingChannel || !newChannelName.trim()}
              className="bg-nexus-violet hover:bg-nexus-violet/80"
            >
              {creatingChannel ? 'Creating…' : 'Create Channel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

function ChannelRow({ ch, isActive, onClick }: {
  ch: Channel;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm group',
        isActive
          ? 'bg-white/10 text-white'
          : 'text-muted-foreground hover:bg-white/5 hover:text-white/80'
      )}
    >
      {ch.type === 'voice' ? (
        <Volume2 className="h-4 w-4 shrink-0 text-nexus-lavender/70" />
      ) : (
        <Hash className="h-4 w-4 shrink-0 text-nexus-lavender/70" />
      )}
      <span className="truncate">{ch.name}</span>
    </button>
  );
}
