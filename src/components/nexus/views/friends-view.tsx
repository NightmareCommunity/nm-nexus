'use client';

import { useEffect, useState } from 'react';
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

type Profile = Database['public']['Tables']['profiles']['Row'];
type Friendship = Database['public']['Tables']['friendships']['Row'];

interface FriendWithProfile extends Friendship {
  other_profile: Profile;
}

export function FriendsView({ mobile = false }: { mobile?: boolean }) {
  const { user } = useAuthStore();
  const { setActiveProfileUserId, setActiveConversation, setActiveView, startCall } = useUIStore();
  const [tab, setTab] = useState<'online' | 'all' | 'pending' | 'blocked' | 'add'>('online');
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [pending, setPending] = useState<FriendWithProfile[]>([]);
  const [blocked, setBlocked] = useState<FriendWithProfile[]>([]);
  const [search, setSearch] = useState('');
  const [addUsername, setAddUsername] = useState('');
  const [addResults, setAddResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const loadFriends = async () => {
    if (!user) return;
    const supabase = createClient();

    // Get all friendships involving me
    const [outgoing, incoming] = await Promise.all([
      supabase.from('friendships').select('*').eq('requester_id', user.id),
      supabase.from('friendships').select('*').eq('addressee_id', user.id),
    ]);

    const all = [...(outgoing.data || []), ...(incoming.data || [])];
    const friendIds = all
      .filter((f) => f.status === 'accepted')
      .map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id));
    const pendingIds = all
      .filter((f) => f.status === 'pending')
      .map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id));
    const blockedIds = all
      .filter((f) => f.status === 'blocked')
      .map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id));

    const loadProfiles = async (ids: string[], status: string) => {
      if (ids.length === 0) return [];
      const { data } = await supabase.from('profiles').select('*').in('id', ids);
      return (data || []).map((p) => {
        const f = all.find((x) =>
          (x.requester_id === user.id && x.addressee_id === p.id) ||
          (x.addressee_id === user.id && x.requester_id === p.id)
        )!;
        return { ...f, other_profile: p as Profile };
      });
    };

    setFriends(await loadProfiles(friendIds, 'accepted'));
    setPending(await loadProfiles(pendingIds, 'pending'));
    setBlocked(await loadProfiles(blockedIds, 'blocked'));
  };

  useEffect(() => {
    loadFriends();
  }, [user]);

  const searchUsers = async (username: string) => {
    setAddUsername(username);
    if (!username.trim() || !user) { setAddResults([]); return; }
    const supabase = createClient();
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', `%${username}%`)
      .neq('id', user.id)
      .limit(10);
    setAddResults((data || []) as Profile[]);
  };

  const sendRequest = async (otherId: string) => {
    if (!user) return;
    const supabase = createClient();
    const { error } = await supabase.from('friendships').insert({
      requester_id: user.id,
      addressee_id: otherId,
      status: 'pending',
    });
    if (error) toast.error(error.message);
    else { toast.success('Friend request sent'); loadFriends(); }
  };

  const respondToRequest = async (id: string, accept: boolean) => {
    if (!user) return;
    const supabase = createClient();
    const { error } = await supabase.from('friendships')
      .update({ status: accept ? 'accepted' : 'declined', responded_at: new Date().toISOString() })
      .eq('requester_id', id)
      .eq('addressee_id', user.id);
    if (error) toast.error(error.message);
    else {
      toast.success(accept ? 'Friend added' : 'Request declined');
      loadFriends();
    }
  };

  const startDm = async (otherId: string) => {
    if (!user) return;
    const supabase = createClient();
    // Look for existing
    const { data: myConvs } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', user.id);
    if (myConvs && myConvs.length > 0) {
      const { data: theirConvs } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', otherId)
        .in('conversation_id', myConvs.map((m) => m.conversation_id));
      if (theirConvs && theirConvs.length > 0) {
        setActiveConversation(theirConvs[0].conversation_id);
        setActiveView('dms');
        return;
      }
    }
    const { data: conv, error } = await supabase
      .from('conversations')
      .insert({ type: 'direct', is_encrypted: true, created_by: user.id })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    await supabase.from('conversation_members').insert([
      { conversation_id: conv.id, user_id: user.id, role: 'member' },
      { conversation_id: conv.id, user_id: otherId, role: 'member' },
    ]);
    setActiveConversation(conv.id);
    setActiveView('dms');
  };

  const removeFriend = async (otherId: string) => {
    if (!user) return;
    const supabase = createClient();
    await supabase.from('friendships')
      .delete()
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .or(`addressee_id.eq.${user.id},requester_id.eq.${user.id}`);
    toast.success('Removed friend');
    loadFriends();
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
      {/* Header */}
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

      {/* Tabs */}
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'add' ? (
          <div className="max-w-md">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Add Friend</h3>
            <p className="text-xs text-muted-foreground mb-3">Enter a username to send a friend request.</p>
            <div className="flex gap-2">
              <Input
                value={addUsername}
                onChange={(e) => searchUsers(e.target.value)}
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
                      <div className="text-xs text-muted-foreground">@{p.username}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => sendRequest(p.id)} className="gap-1 h-7">
                      <UserPlus className="h-3 w-3" /> Add
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : tab === 'pending' ? (
          <div className="space-y-1">
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground/70 py-8 text-center">
                No pending requests.
              </p>
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
                        <Button size="sm" variant="outline" onClick={() => respondToRequest(f.requester_id, true)} className="gap-1 h-7 bg-green-500/10 border-green-500/30 text-green-500 hover:bg-green-500/20">
                          <Check className="h-3 w-3" /> Accept
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => respondToRequest(f.requester_id, false)} className="gap-1 h-7 text-destructive">
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
              <p className="text-sm text-muted-foreground/70 py-8 text-center">
                No blocked users.
              </p>
            ) : (
              blocked.map((f) => (
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
                    <div className="text-xs text-muted-foreground">@{f.other_profile.username}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => removeFriend(f.other_profile.id)} className="gap-1 h-7">
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
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => startDm(f.other_profile.id)} aria-label="Message">
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => startCall('voice', { id: f.other_profile.id, name: f.other_profile.display_name || f.other_profile.username, avatar: f.other_profile.avatar || undefined })} aria-label="Voice call">
                      <Phone className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hidden md:flex" onClick={() => startCall('video', { id: f.other_profile.id, name: f.other_profile.display_name || f.other_profile.username, avatar: f.other_profile.avatar || undefined })} aria-label="Video call">
                      <Video className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => removeFriend(f.other_profile.id)} aria-label="Remove friend">
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
