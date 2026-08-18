'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Phone, Video, UserPlus, UserMinus, Ban, Search, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  startDmWithUser,
  sendFriendRequest,
  respondToFriendRequest,
  removeFriend,
  blockUser,
  unblockUser,
  searchUsers,
} from '@/lib/nexus-helpers';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Friendship = Database['public']['Tables']['friendships']['Row'];

interface FriendWithProfile extends Friendship {
  other_profile: Profile;
}
interface BlockedUser {
  blocked_id: string;
  other_profile: Profile;
}

export function FriendsView({ mobile = false }: { mobile?: boolean }) {
  const { user } = useAuthStore();
  const { setActiveProfileUserId, setActiveConversation, setActiveView, startCall } = useUIStore();
  const [tab, setTab] = useState<'online' | 'all' | 'pending' | 'blocked' | 'add'>('online');
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [pending, setPending] = useState<FriendWithProfile[]>([]);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [search, setSearch] = useState('');
  const [addUsername, setAddUsername] = useState('');
  const [addResults, setAddResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const loadFriends = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const supabase = createClient();

    try {
      // Get all friendships involving me + all blocks I've made
      const [outgoing, incoming, blocksOut] = await Promise.all([
        supabase.from('friendships').select('*').eq('requester_id', user.id),
        supabase.from('friendships').select('*').eq('addressee_id', user.id),
        supabase.from('blocks').select('blocked_id').eq('blocker_id', user.id),
      ]);

      const all = [...(outgoing.data || []), ...(incoming.data || [])];
      const friendIds = all
        .filter((f) => f.status === 'accepted')
        .map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id));
      const pendingIds = all
        .filter((f) => f.status === 'pending')
        .map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id));
      const blockedIds = (blocksOut.data || []).map((b) => b.blocked_id);

      const allIds = Array.from(new Set([...friendIds, ...pendingIds, ...blockedIds]));
      if (allIds.length === 0) {
        setFriends([]);
        setPending([]);
        setBlocked([]);
        return;
      }
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', allIds);
      const profileMap = new Map((profiles || []).map((p) => [p.id, p as Profile]));

      const friendList: FriendWithProfile[] = [];
      const pendingList: FriendWithProfile[] = [];
      for (const f of all) {
        const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
        const otherProfile = profileMap.get(otherId);
        if (!otherProfile) continue;
        const entry = { ...f, other_profile: otherProfile };
        if (f.status === 'accepted') friendList.push(entry);
        else if (f.status === 'pending') pendingList.push(entry);
      }
      const blockedList: BlockedUser[] = blockedIds
        .map((id) => {
          const p = profileMap.get(id);
          return p ? { blocked_id: id, other_profile: p } : null;
        })
        .filter((x): x is BlockedUser => x !== null);

      setFriends(friendList);
      setPending(pendingList);
      setBlocked(blockedList);
    } catch (e) {
      console.error('loadFriends failed', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  // Realtime: refresh list on friendship changes
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`friends-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `requester_id=eq.${user.id}` },
        () => loadFriends()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${user.id}` },
        () => loadFriends()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blocks', filter: `blocker_id=eq.${user.id}` },
        () => loadFriends()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        () => loadFriends()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadFriends]);

  const handleSearch = async (username: string) => {
    setAddUsername(username);
    if (!username.trim() || !user) { setAddResults([]); return; }
    const results = await searchUsers(username, 10);
    setAddResults(results as Profile[]);
  };

  const handleSendRequest = async (otherId: string) => {
    const ok = await sendFriendRequest(otherId);
    if (ok) {
      setAddResults((prev) => prev.filter((p) => p.id !== otherId));
      loadFriends();
    }
  };

  const handleRespond = async (friendshipId: string, accept: boolean) => {
    const ok = await respondToFriendRequest(friendshipId, accept);
    if (ok) loadFriends();
  };

  const handleStartDm = async (otherId: string) => {
    const convId = await startDmWithUser(otherId);
    if (convId) {
      setActiveConversation(convId);
      setActiveView('dms');
    }
  };

  const handleRemoveFriend = async (otherId: string) => {
    if (!user) return;
    const ok = await removeFriend(otherId, user.id);
    if (ok) loadFriends();
  };

  const handleBlock = async (otherId: string) => {
    if (!user) return;
    const ok = await blockUser(otherId, user.id);
    if (ok) loadFriends();
  };

  const handleUnblock = async (otherId: string) => {
    if (!user) return;
    const ok = await unblockUser(otherId, user.id);
    if (ok) loadFriends();
  };

  const filteredFriends = friends.filter((f) => {
    if (!search) return true;
    const name = f.other_profile.display_name || f.other_profile.username || '';
    return name.toLowerCase().includes(search.toLowerCase());
  });
  const onlineFriends = filteredFriends.filter((f) => f.other_profile.status === 'online');
  const displayFriends = tab === 'online' ? onlineFriends : filteredFriends;

  return (
    <div className="flex-1 flex flex-col bg-[#0a0810]">
      <div className="h-12 px-4 flex items-center gap-3 border-b border-white/5 shadow-sm shrink-0">
        <span className="font-semibold text-white">Friends</span>
        <div className="ml-auto relative w-48 hidden sm:block">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full pl-7 pr-3 py-1 text-xs rounded bg-[#13101a] border border-white/5 placeholder:text-muted-foreground focus:outline-none focus:border-nexus-violet/50"
          />
        </div>
      </div>

      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2 flex-wrap">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="online">Online</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">
              Pending {pending.length > 0 && <span className="ml-1 h-4 min-w-4 px-1 rounded-full bg-nexus-violet text-white text-[10px] flex items-center justify-center">{pending.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="blocked">Blocked</TabsTrigger>
            <TabsTrigger value="add">Add Friend</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'add' ? (
          <div className="max-w-md">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Add Friend</h3>
            <p className="text-xs text-muted-foreground mb-3">Enter a username to send a friend request.</p>
            <div className="flex gap-2">
              <Input
                value={addUsername}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="username"
                className="bg-[#13101a] border-white/10"
              />
            </div>
            {addResults.length > 0 && (
              <div className="mt-4 space-y-1">
                {addResults.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded hover:bg-white/5">
                    <Avatar className="h-8 w-8">
                      {p.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatar} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <AvatarFallback className="text-[10px]" style={{ backgroundColor: p.avatar_color || '#7c3aed', color: 'white' }}>
                          {(p.display_name || p.username || 'U').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">{p.display_name || p.username}</div>
                      <div className="text-xs text-muted-foreground">@{p.username}{p.discriminator && p.discriminator !== '0001' ? `#${p.discriminator}` : ''}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleSendRequest(p.id)} className="gap-1 h-7">
                      <UserPlus className="h-3 w-3" /> Add
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {addUsername.trim() && addResults.length === 0 && (
              <p className="text-xs text-muted-foreground/70 mt-4">No users found.</p>
            )}
          </div>
        ) : tab === 'pending' ? (
          <div className="space-y-1">
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground/70 py-8 text-center">No pending requests.</p>
            ) : (
              pending.map((f) => {
                const incoming = f.addressee_id === user?.id;
                return (
                  <div key={f.id} className="flex items-center gap-3 p-3 rounded hover:bg-white/5">
                    <Avatar className="h-10 w-10">
                      {f.other_profile.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.other_profile.avatar} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <AvatarFallback className="text-xs" style={{ backgroundColor: f.other_profile.avatar_color || '#7c3aed', color: 'white' }}>
                          {(f.other_profile.display_name || f.other_profile.username || 'U').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">{f.other_profile.display_name || f.other_profile.username}</div>
                      <div className="text-xs text-muted-foreground">
                        {incoming ? 'Incoming request' : 'Outgoing request'} · @{f.other_profile.username}
                      </div>
                    </div>
                    {incoming && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleRespond(f.id, true)} className="gap-1 h-7 bg-green-500/10 border-green-500/30 text-green-500 hover:bg-green-500/20">
                          <Check className="h-3 w-3" /> Accept
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleRespond(f.id, false)} className="gap-1 h-7 text-destructive">
                          <X className="h-3 w-3" /> Decline
                        </Button>
                      </>
                    )}
                    {!incoming && (
                      <span className="text-xs text-muted-foreground italic">Pending…</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : tab === 'blocked' ? (
          <div className="space-y-1">
            {blocked.length === 0 ? (
              <p className="text-sm text-muted-foreground/70 py-8 text-center">No blocked users.</p>
            ) : (
              blocked.map((b) => (
                <div key={b.blocked_id} className="flex items-center gap-3 p-3 rounded hover:bg-white/5">
                  <Avatar className="h-10 w-10">
                    {b.other_profile.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.other_profile.avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <AvatarFallback className="text-xs" style={{ backgroundColor: b.other_profile.avatar_color || '#7c3aed', color: 'white' }}>
                        {(b.other_profile.display_name || b.other_profile.username || 'U').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">{b.other_profile.display_name || b.other_profile.username}</div>
                    <div className="text-xs text-muted-foreground">@{b.other_profile.username}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleUnblock(b.blocked_id)} className="gap-1 h-7">
                    Unblock
                  </Button>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {displayFriends.length === 0 ? (
              <p className="text-sm text-muted-foreground/70 py-8 text-center">
                {tab === 'online' ? 'No friends online right now.' : 'No friends yet. Try the Add Friend tab.'}
              </p>
            ) : (
              displayFriends.map((f) => (
                <div key={f.id} className="flex items-center gap-3 p-3 rounded hover:bg-white/5 group">
                  <button onClick={() => setActiveProfileUserId(f.other_profile.id)} className="relative">
                    <Avatar className="h-10 w-10">
                      {f.other_profile.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.other_profile.avatar} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <AvatarFallback className="text-xs" style={{ backgroundColor: f.other_profile.avatar_color || '#7c3aed', color: 'white' }}>
                          {(f.other_profile.display_name || f.other_profile.username || 'U').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0a0810]', f.other_profile.status === 'online' ? 'bg-green-500' : 'bg-gray-500')} />
                  </button>
                  <div className="flex-1">
                    <button onClick={() => setActiveProfileUserId(f.other_profile.id)} className="text-sm font-medium text-white hover:underline">
                      {f.other_profile.display_name || f.other_profile.username}
                    </button>
                    <div className="text-xs text-muted-foreground">
                      @{f.other_profile.username} · {f.other_profile.status === 'online' ? 'Online' : 'Offline'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleStartDm(f.other_profile.id)} aria-label="Message">
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => startCall('voice', { id: f.other_profile.id, name: f.other_profile.display_name || f.other_profile.username, avatar: f.other_profile.avatar || undefined })} aria-label="Voice call">
                      <Phone className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hidden md:flex" onClick={() => startCall('video', { id: f.other_profile.id, name: f.other_profile.display_name || f.other_profile.username, avatar: f.other_profile.avatar || undefined })} aria-label="Video call">
                      <Video className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => handleBlock(f.other_profile.id)} aria-label="Block" title="Block user">
                      <Ban className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => handleRemoveFriend(f.other_profile.id)} aria-label="Remove friend" title="Remove friend">
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
