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
  Link as LinkIcon, Clock, Hash as HashIcon, Infinity as InfinityIcon, XCircle,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Database } from '@/lib/database.types';
import {
  createCommunityInvite,
  listCommunityInvites,
  revokeCommunityInvite,
  createChannelCategory,
  deleteChannelSafely,
  renameChannel,
  type CommunityInviteRow,
} from '@/lib/nexus-helpers';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Conversation = Database['public']['Tables']['conversations']['Row'];
type Channel = Database['public']['Tables']['channels']['Row'];
type Community = Database['public']['Tables']['communities']['Row'];
type ChannelCategory = Database['public']['Tables']['channel_categories']['Row'];

export function ChannelSidebar() {
  const { user, profile } = useAuthStore();
  const {
    activeView, activeCommunityId, activeConversationId, activeChannelId,
    setActiveConversation, setActiveChannel, setActiveView, setActiveCommunity,
    setMobileSheetOpen, setRightPanelOpen,
  } = useUIStore();

  const [search, setSearch] = useState('');
  const [dmList, setDmList] = useState<(Conversation & { other_user?: Profile; last_message?: string; unread?: number })[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<ChannelCategory[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');
  const [newChannelCategory, setNewChannelCategory] = useState<string | null>(null);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteList, setInviteList] = useState<CommunityInviteRow[]>([]);
  const [newInviteType, setNewInviteType] = useState<'permanent' | 'onetime' | 'expiring' | 'limited'>('permanent');
  const [newInviteExpiryHours, setNewInviteExpiryHours] = useState(24);
  const [newInviteMaxUses, setNewInviteMaxUses] = useState(5);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const loadAll = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();

    // DMs
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

        // Count unread
        let unread = 0;
        if (lastMsg && lastMsg.created_at) {
          const { data: rs } = await supabase
            .from('read_states')
            .select('last_read_at')
            .eq('user_id', user.id)
            .eq('conversation_id', c.id)
            .maybeSingle();
          const lastReadAt = rs?.last_read_at ? new Date(rs.last_read_at).getTime() : 0;
          if (new Date(lastMsg.created_at).getTime() > lastReadAt) {
            const { count } = await supabase
              .from('messages')
              .select('id', { count: 'exact', head: true })
              .eq('conversation_id', c.id)
              .gt('created_at', new Date(lastReadAt).toISOString())
              .neq('sender_id', user.id)
              .is('deleted_at', null);
            unread = count || 0;
          }
        }
        return { ...c, other_user: otherUser, last_message: lastMsg?.plaintext_body || '', unread };
      });
      const dms = await Promise.all(dmPromises);
      setDmList(dms);
    }

    // Communities
    const { data: myCommunities, error: comErr } = await supabase
      .from('community_members')
      .select('community_id, communities!inner(*)')
      .eq('user_id', user.id);
    if (comErr) console.warn('community load err', comErr);
    const comms = (myCommunities || []).map((m: any) => m.communities as Community);
    setCommunities(comms);

    // If a community is active, load its channels + categories
    const targetCommunityId = activeCommunityId || comms[0]?.id;
    if (targetCommunityId) {
      const [{ data: chans, error: chanErr }, { data: cats }] = await Promise.all([
        supabase
          .from('channels')
          .select('*')
          .eq('community_id', targetCommunityId)
          .order('position', { ascending: true }),
        supabase
          .from('channel_categories')
          .select('*')
          .eq('community_id', targetCommunityId)
          .order('position', { ascending: true }),
      ]);
      if (chanErr) console.warn('channels load err', chanErr);
      setChannels(chans || []);
      setCategories(cats || []);
      if (!activeCommunityId) setActiveCommunity(targetCommunityId);
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
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'channels' },
        () => { loadAll(); }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations' },
        () => { loadAll(); }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'read_states' },
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
          category_id: newChannelCategory,
        })
        .select()
        .single();
      if (error) throw error;
      toast.success(`Created #${name}`);
      setCreateChannelOpen(false);
      setNewChannelName('');
      setNewChannelCategory(null);
      loadAll();
      setActiveChannel(data.id, activeCommunityId);
    } catch (e: any) {
      toast.error(`Failed to create channel: ${e.message}`);
    } finally {
      setCreatingChannel(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!activeCommunityId || !newCategoryName.trim()) return;
    const id = await createChannelCategory(activeCommunityId, newCategoryName.trim());
    if (id) {
      toast.success(`Category "${newCategoryName}" created`);
      setCreateCategoryOpen(false);
      setNewCategoryName('');
      loadAll();
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

  const openInviteDialog = async () => {
    if (!activeCommunityId) return;
    setInviteDialogOpen(true);
    const list = await listCommunityInvites(activeCommunityId);
    setInviteList(list);
  };

  const handleCreateInvite = async () => {
    if (!activeCommunityId) return;
    setCreatingInvite(true);
    try {
      let maxUses: number | null = null;
      let expiresInHours: number | null = null;
      switch (newInviteType) {
        case 'permanent': maxUses = null; expiresInHours = null; break;
        case 'onetime': maxUses = 1; expiresInHours = null; break;
        case 'expiring': maxUses = null; expiresInHours = newInviteExpiryHours; break;
        case 'limited': maxUses = newInviteMaxUses; expiresInHours = null; break;
      }
      const inv = await createCommunityInvite({
        communityId: activeCommunityId,
        maxUses,
        expiresInHours,
      });
      if (inv) {
        toast.success(`Invite created: ${inv.code}`);
        const list = await listCommunityInvites(activeCommunityId);
        setInviteList(list);
      }
    } finally {
      setCreatingInvite(false);
    }
  };

  // Group channels by category
  const uncategorizedText = channels.filter((c) => c.type !== 'voice' && !c.category_id);
  const uncategorizedVoice = channels.filter((c) => c.type === 'voice' && !c.category_id);
  const channelsByCategory = (categoryId: string) => channels.filter((c) => c.category_id === categoryId);

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
              <DropdownMenuItem onClick={openInviteDialog} className="gap-2 cursor-pointer text-white/90">
                <LinkIcon className="h-3.5 w-3.5" /> Manage invites
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setRightPanelOpen(true)}
                className="gap-2 cursor-pointer text-white/90"
              >
                <Users className="h-3.5 w-3.5" /> Members
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => { setNewChannelType('text'); setNewChannelCategory(null); setCreateChannelOpen(true); }}
                className="gap-2 cursor-pointer text-white/90"
              >
                <Hash className="h-3.5 w-3.5" /> Create channel
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setCreateCategoryOpen(true)}
                className="gap-2 cursor-pointer text-white/90"
              >
                <Plus className="h-3.5 w-3.5" /> Create category
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
        {/* Community channels — Discord-style: categories + Uncategorized sections */}
        {showCommunityList && (
          <div className="space-y-3 pt-1">
            {/* Uncategorized Text Channels */}
            {uncategorizedText.length > 0 && (
              <ChannelSection
                title="Text Channels"
                sectionKey="text"
                collapsedSections={collapsedSections}
                setCollapsedSections={setCollapsedSections}
                onCreate={() => { setNewChannelType('text'); setNewChannelCategory(null); setCreateChannelOpen(true); }}
                channels={uncategorizedText}
                activeChannelId={activeChannelId}
                onSelect={(ch) => setActiveChannel(ch.id, activeCommunityId)}
                canManage={!!activeCommunity && activeCommunity.owner_id === user?.id}
                onDelete={(ch) => deleteChannelSafely(ch.id).then(() => loadAll())}
                onRename={(ch, name) => renameChannel(ch.id, name).then(() => loadAll())}
              />
            )}

            {/* Uncategorized Voice Channels */}
            {uncategorizedVoice.length > 0 && (
              <ChannelSection
                title="Voice Channels"
                sectionKey="voice"
                collapsedSections={collapsedSections}
                setCollapsedSections={setCollapsedSections}
                onCreate={() => { setNewChannelType('voice'); setNewChannelCategory(null); setCreateChannelOpen(true); }}
                channels={uncategorizedVoice}
                activeChannelId={activeChannelId}
                onSelect={(ch) => setActiveChannel(ch.id, activeCommunityId)}
                canManage={!!activeCommunity && activeCommunity.owner_id === user?.id}
                onDelete={(ch) => deleteChannelSafely(ch.id).then(() => loadAll())}
                onRename={(ch, name) => renameChannel(ch.id, name).then(() => loadAll())}
              />
            )}

            {/* Categories */}
            {categories.map((cat) => (
              <ChannelSection
                key={cat.id}
                title={cat.name}
                sectionKey={`cat-${cat.id}`}
                collapsedSections={collapsedSections}
                setCollapsedSections={setCollapsedSections}
                onCreate={() => { setNewChannelType('text'); setNewChannelCategory(cat.id); setCreateChannelOpen(true); }}
                channels={channelsByCategory(cat.id)}
                activeChannelId={activeChannelId}
                onSelect={(ch) => setActiveChannel(ch.id, activeCommunityId)}
                canManage={!!activeCommunity && activeCommunity.owner_id === user?.id}
                onDelete={(ch) => deleteChannelSafely(ch.id).then(() => loadAll())}
                onRename={(ch, name) => renameChannel(ch.id, name).then(() => loadAll())}
              />
            ))}

            {/* Empty state */}
            {channels.length === 0 && (
              <p className="text-[10px] text-muted-foreground/60 px-2 py-2">
                No channels yet. Use the community menu above to create one.
              </p>
            )}
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
                      {dm.unread && dm.unread > 0 ? (
                        <span className="bg-nexus-violet text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                          {dm.unread > 99 ? '99+' : dm.unread}
                        </span>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
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
                      )}
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
                    <div className="text-[10px] text-muted-foreground">
                      Small-group mesh (max ~6 participants)
                    </div>
                  </div>
                </button>
              </div>
            </div>
            {categories.length > 0 && (
              <div>
                <Label className="text-xs">Category (optional)</Label>
                <select
                  value={newChannelCategory || ''}
                  onChange={(e) => setNewChannelCategory(e.target.value || null)}
                  className="mt-1 w-full bg-[#0a0810] border border-white/10 rounded px-2 py-1.5 text-sm text-white"
                >
                  <option value="">— No category —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
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

      {/* Create Category dialog */}
      <Dialog open={createCategoryOpen} onOpenChange={setCreateCategoryOpen}>
        <DialogContent className="bg-[#13101a] border border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Create Category</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs">Category Name</Label>
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value.slice(0, 50))}
              placeholder="Information"
              className="bg-[#0a0810] border-white/10 mt-1"
              onKeyDown={(e) => { if (e.key === 'Enter' && newCategoryName.trim()) handleCreateCategory(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateCategoryOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateCategory}
              disabled={!newCategoryName.trim()}
              className="bg-nexus-violet hover:bg-nexus-violet/80"
            >
              Create Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Management dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="bg-[#13101a] border border-white/10 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Invites — {activeCommunity?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {/* Create new invite */}
            <div className="p-3 rounded-md bg-[#0a0810] border border-white/5 space-y-2">
              <div className="text-xs font-medium text-white">Create new invite</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setNewInviteType('permanent')}
                  className={cn('flex items-center gap-1.5 p-2 rounded border text-xs',
                    newInviteType === 'permanent' ? 'border-nexus-violet bg-nexus-violet/10' : 'border-white/10 hover:border-white/20')}
                >
                  <InfinityIcon className="h-3 w-3" /> Permanent
                </button>
                <button
                  onClick={() => setNewInviteType('onetime')}
                  className={cn('flex items-center gap-1.5 p-2 rounded border text-xs',
                    newInviteType === 'onetime' ? 'border-nexus-violet bg-nexus-violet/10' : 'border-white/10 hover:border-white/20')}
                >
                  <HashIcon className="h-3 w-3" /> One-time (1 use)
                </button>
                <button
                  onClick={() => setNewInviteType('expiring')}
                  className={cn('flex items-center gap-1.5 p-2 rounded border text-xs',
                    newInviteType === 'expiring' ? 'border-nexus-violet bg-nexus-violet/10' : 'border-white/10 hover:border-white/20')}
                >
                  <Clock className="h-3 w-3" /> Expiring
                </button>
                <button
                  onClick={() => setNewInviteType('limited')}
                  className={cn('flex items-center gap-1.5 p-2 rounded border text-xs',
                    newInviteType === 'limited' ? 'border-nexus-violet bg-nexus-violet/10' : 'border-white/10 hover:border-white/20')}
                >
                  <Users className="h-3 w-3" /> Limited-use
                </button>
              </div>
              {newInviteType === 'expiring' && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0">Expires in (hours):</Label>
                  <Input
                    type="number"
                    min={1}
                    value={newInviteExpiryHours}
                    onChange={(e) => setNewInviteExpiryHours(parseInt(e.target.value) || 1)}
                    className="bg-[#0a0810] border-white/10 h-8 w-24"
                  />
                </div>
              )}
              {newInviteType === 'limited' && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0">Max uses:</Label>
                  <Input
                    type="number"
                    min={1}
                    value={newInviteMaxUses}
                    onChange={(e) => setNewInviteMaxUses(parseInt(e.target.value) || 1)}
                    className="bg-[#0a0810] border-white/10 h-8 w-24"
                  />
                </div>
              )}
              <Button
                onClick={handleCreateInvite}
                disabled={creatingInvite}
                size="sm"
                className="bg-nexus-violet hover:bg-nexus-violet/80 w-full"
              >
                {creatingInvite ? 'Creating…' : 'Create invite'}
              </Button>
            </div>

            {/* List existing invites */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground px-1">Active invites</div>
              {inviteList.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 px-2 py-4 text-center">No invites yet.</p>
              ) : (
                inviteList.map((inv) => {
                  const isRevoked = !!inv.revoked_at;
                  const isExpired = inv.expires_at && new Date(inv.expires_at) < new Date();
                  const isExhausted = inv.max_uses !== null && inv.uses >= inv.max_uses;
                  const isActive = !isRevoked && !isExpired && !isExhausted;
                  return (
                    <div
                      key={inv.id}
                      className={cn(
                        'flex items-center gap-2 p-2 rounded border',
                        isActive ? 'bg-[#0a0810] border-white/5' : 'bg-red-500/5 border-red-500/20 opacity-70'
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm text-white truncate">{inv.code}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span>{inv.uses}{inv.max_uses !== null ? `/${inv.max_uses}` : ''} uses</span>
                          {inv.expires_at && <span>· expires {new Date(inv.expires_at).toLocaleString()}</span>}
                          {isRevoked && <span className="text-red-400">· revoked</span>}
                          {isExpired && <span className="text-red-400">· expired</span>}
                          {isExhausted && <span className="text-red-400">· exhausted</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => { navigator.clipboard.writeText(inv.code); toast.success(`Copied: ${inv.code}`); }}
                        disabled={!isActive}
                        className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30"
                        title="Copy code"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      {isActive && (
                        <button
                          onClick={() => revokeCommunityInvite(inv.id).then(() => listCommunityInvites(activeCommunityId!).then(setInviteList))}
                          className="p-1.5 rounded hover:bg-white/10 text-destructive"
                          title="Revoke"
                        >
                          <XCircle className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

interface ChannelSectionProps {
  title: string;
  sectionKey: string;
  collapsedSections: Set<string>;
  setCollapsedSections: React.Dispatch<React.SetStateAction<Set<string>>>;
  onCreate: () => void;
  channels: Channel[];
  activeChannelId: string | null;
  onSelect: (ch: Channel) => void;
  canManage: boolean;
  onDelete: (ch: Channel) => void;
  onRename: (ch: Channel, name: string) => void;
}

function ChannelSection({
  title, sectionKey, collapsedSections, setCollapsedSections, onCreate, channels, activeChannelId, onSelect, canManage, onDelete, onRename,
}: ChannelSectionProps) {
  const isCollapsed = collapsedSections.has(sectionKey);
  return (
    <div>
      <div className="flex items-center justify-between px-1 mb-0.5">
        <button
          onClick={() => setCollapsedSections((s) => {
            const n = new Set(s);
            n.has(sectionKey) ? n.delete(sectionKey) : n.add(sectionKey);
            return n;
          })}
          className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground hover:text-white/80"
        >
          {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {title}
        </button>
        {canManage && (
          <button
            onClick={onCreate}
            className="p-0.5 rounded hover:bg-white/5 text-muted-foreground hover:text-white"
            aria-label={`Create channel in ${title}`}
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
      {!isCollapsed && (
        <div className="space-y-0.5">
          {channels.length === 0 ? (
            <p className="text-[10px] text-muted-foreground/60 px-2 py-1">No channels.</p>
          ) : (
            channels.map((ch) => (
              <ChannelRow
                key={ch.id}
                ch={ch}
                isActive={activeChannelId === ch.id}
                onClick={() => onSelect(ch)}
                canManage={canManage}
                onDelete={() => onDelete(ch)}
                onRename={(name) => onRename(ch, name)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ChannelRow({ ch, isActive, onClick, canManage, onDelete, onRename }: {
  ch: Channel;
  isActive: boolean;
  onClick: () => void;
  canManage: boolean;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(ch.name);

  if (renaming) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        {ch.type === 'voice' ? <Volume2 className="h-4 w-4 shrink-0 text-nexus-lavender/70" /> : <Hash className="h-4 w-4 shrink-0 text-nexus-lavender/70" />}
        <input
          autoFocus
          value={renameVal}
          onChange={(e) => setRenameVal(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
          onBlur={() => { setRenaming(false); if (renameVal && renameVal !== ch.name) onRename(renameVal); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { setRenaming(false); if (renameVal && renameVal !== ch.name) onRename(renameVal); }
            if (e.key === 'Escape') { setRenaming(false); setRenameVal(ch.name); }
          }}
          className="flex-1 bg-[#0a0810] border border-nexus-violet/50 rounded px-1 py-0.5 text-xs text-white outline-none"
        />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'group w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm cursor-pointer',
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
      <span className="truncate flex-1">{ch.name}</span>
      {canManage && (
        <div className="opacity-0 group-hover:opacity-100 flex">
          <button
            onClick={(e) => { e.stopPropagation(); setRenaming(true); setRenameVal(ch.name); }}
            className="p-0.5 rounded hover:bg-white/10"
            aria-label="Rename"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete #${ch.name}? All messages in this channel will be permanently removed.`)) {
                onDelete();
              }
            }}
            className="p-0.5 rounded hover:bg-white/10 text-destructive"
            aria-label="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
