'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { UserPlus, Search, UserCheck, UserX, MessageSquare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useUIStore } from '@/lib/stores/ui-store';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Friendship = Database['public']['Tables']['friendships']['Row'];

interface FriendWithProfile extends Friendship {
  other: Profile;
}

export function ContactsView({ mobile = false }: { mobile?: boolean }) {
  const { user } = useAuthStore();
  const { setActiveConversation, setActiveView, setMobileTab } = useUIStore();
  const [tab, setTab] = useState<'friends' | 'requests' | 'blocked' | 'add'>('friends');
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [requests, setRequests] = useState<FriendWithProfile[]>([]);
  const [blocked, setBlocked] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [results, setSearchResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const [accepted, pending, blockedList] = await Promise.all([
      supabase.from('friendships')
        .select('*, other:profiles!friendships_addressee_id_fkey(*)')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
      supabase.from('friendships')
        .select('*, other:profiles!friendships_requester_id_fkey(*)')
        .eq('status', 'pending')
        .eq('addressee_id', user.id),
      supabase.from('blocks')
        .select('blocked:profiles!blocks_blocked_id_fkey(*)')
        .eq('blocker_id', user.id),
    ]);
    setFriends((accepted.data || []).map((f: any) => ({ ...f, other: f.other })) as FriendWithProfile[]);
    setRequests((pending.data || []).map((f: any) => ({ ...f, other: f.other })) as FriendWithProfile[]);
    setBlocked((blockedList.data || []).map((b: any) => b.blocked as Profile));
  }, [user]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab !== 'add' || search.length < 2) { setSearchResults([]); return; }
    setLoading(true);
    const supabase = createClient();
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${search}%,display_name.ilike.%${search}%`)
        .neq('id', user!.id)
        .limit(20);
      setSearchResults(data || []);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [search, tab, user]);

  const sendRequest = async (target: Profile) => {
    if (!user) return;
    const supabase = createClient();
    const { error } = await supabase.from('friendships').insert({
      requester_id: user.id, addressee_id: target.id, status: 'pending',
    });
    if (error) toast.error(error.message);
    else toast.success(`Friend request sent to @${target.username}`);
  };

  const respondRequest = async (id: string, status: 'accepted' | 'declined') => {
    const supabase = createClient();
    const { error } = await supabase.from('friendships').update({
      status, responded_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success(status === 'accepted' ? 'Friend added' : 'Request declined'); load(); }
  };

  const startDm = async (other: Profile) => {
    if (!user) return;
    const supabase = createClient();
    // Check for existing DM
    const { data: existing } = await supabase
      .from('conversation_members')
      .select('conversation_id, conversations!inner(type, is_encrypted)')
      .eq('user_id', other.id);
    const found = (existing || []).find((m: any) => m.conversations?.type === 'direct');
    let convId: string;
    if (found) {
      convId = found.conversation_id;
      await supabase.from('conversation_members').upsert({
        conversation_id: convId, user_id: user.id, role: 'owner',
      });
    } else {
      const { data: conv, error } = await supabase.from('conversations').insert({
        type: 'direct', is_encrypted: true, created_by: user.id,
      }).select().single();
      if (error) { toast.error(error.message); return; }
      convId = conv.id;
      await supabase.from('conversation_members').insert([
        { conversation_id: convId, user_id: user.id, role: 'owner' },
        { conversation_id: convId, user_id: other.id, role: 'member' },
      ]);
    }
    setActiveConversation(convId);
    if (mobile) setMobileTab('chats');
    else setActiveView('dms');
  };

  const unblock = async (target: Profile) => {
    if (!user) return;
    const supabase = createClient();
    await supabase.from('blocks').delete()
      .eq('blocker_id', user.id).eq('blocked_id', target.id);
    toast.success(`Unblocked @${target.username}`);
    load();
  };

  const tabs = [
    { id: 'friends' as const, label: 'Friends', count: friends.length },
    { id: 'requests' as const, label: 'Requests', count: requests.length },
    { id: 'blocked' as const, label: 'Blocked', count: blocked.length },
    { id: 'add' as const, label: 'Add', count: 0 },
  ];

  return (
    <div className="h-full flex flex-col">
      <header className="h-16 flex items-center px-4 border-b border-border">
        <h1 className="font-semibold">Contacts</h1>
      </header>
      <div className="flex gap-1 p-2 border-b border-border overflow-x-auto scrollbar-thin">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:bg-accent/40'
            }`}
          >
            {t.label}
            {t.count > 0 && <span className="ml-1.5 text-xs text-nexus-lavender">{t.count}</span>}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
        {tab === 'friends' && (
          friends.length === 0 ? (
            <Empty text="No friends yet. Switch to Add to find people." />
          ) : (
            <div className="space-y-0.5">
              {friends.map(f => (
                <div key={f.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/40">
                  <Avatar className="h-10 w-10 ring-1 ring-border">
                    <AvatarFallback style={{ backgroundColor: f.other.avatar_color, color: 'white' }}>
                      {(f.other.display_name || f.other.username).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{f.other.display_name || f.other.username}</div>
                    <div className="text-xs text-muted-foreground truncate">@{f.other.username}</div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startDm(f.other)}>
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )
        )}
        {tab === 'requests' && (
          requests.length === 0 ? <Empty text="No pending requests" /> : (
            <div className="space-y-0.5">
              {requests.map(r => (
                <div key={r.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/40">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback style={{ backgroundColor: r.other.avatar_color, color: 'white' }}>
                      {(r.other.display_name || r.other.username).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.other.display_name || r.other.username}</div>
                    <div className="text-xs text-muted-foreground truncate">@{r.other.username}</div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-400" onClick={() => respondRequest(r.id, 'accepted')}>
                    <UserCheck className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => respondRequest(r.id, 'declined')}>
                    <UserX className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )
        )}
        {tab === 'blocked' && (
          blocked.length === 0 ? <Empty text="No blocked users" /> : (
            <div className="space-y-0.5">
              {blocked.map(b => (
                <div key={b.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/40">
                  <Avatar className="h-10 w-10 grayscale">
                    <AvatarFallback style={{ backgroundColor: b.avatar_color, color: 'white' }}>
                      {(b.display_name || b.username).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{b.display_name || b.username}</div>
                    <div className="text-xs text-muted-foreground truncate">@{b.username}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => unblock(b)}>Unblock</Button>
                </div>
              ))}
            </div>
          )
        )}
        {tab === 'add' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search by username or display name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {loading && <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>}
            {!loading && results.length === 0 && search.length >= 2 && (
              <div className="text-center text-sm text-muted-foreground py-4">No users found</div>
            )}
            <div className="space-y-0.5">
              {results.map(p => (
                <div key={p.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/40">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback style={{ backgroundColor: p.avatar_color, color: 'white' }}>
                      {(p.display_name || p.username).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.display_name || p.username}</div>
                    <div className="text-xs text-muted-foreground truncate">@{p.username}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => sendRequest(p)}>
                    <UserPlus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-center text-sm text-muted-foreground py-12">{text}</div>;
}
