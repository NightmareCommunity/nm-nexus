'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MessageSquare, Users, Phone, Bell, ChevronRight, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Conversation = Database['public']['Tables']['conversations']['Row'];

interface DmPreview extends Conversation {
  other_user?: Profile;
  last_message?: string;
  last_message_at?: string;
}

export function HomeView({ mobile = false }: { mobile?: boolean }) {
  const { user, profile } = useAuthStore();
  const { setActiveView, setActiveConversation, setActiveProfileUserId } = useUIStore();
  const [recentDms, setRecentDms] = useState<DmPreview[]>([]);
  const [onlineFriends, setOnlineFriends] = useState<Profile[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();

    // Recent DMs
    supabase
      .from('conversation_members')
      .select('conversation_id, conversations!inner(*)')
      .eq('user_id', user.id)
      .order('conversation_id', { ascending: false })
      .limit(5)
      .then(async ({ data }) => {
        if (!data) return;
        const dms = await Promise.all((data || []).map(async (m: any) => {
          const conv = m.conversations as Conversation;
          const { data: members } = await supabase
            .from('conversation_members')
            .select('user_id, profiles!inner(*)')
            .eq('conversation_id', conv.id)
            .neq('user_id', user.id);
          const otherUser = members?.[0]?.profiles as unknown as Profile;
          const { data: lastMsg } = await supabase
            .from('messages')
            .select('plaintext_body, created_at')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          return {
            ...conv,
            other_user: otherUser,
            last_message: lastMsg?.plaintext_body || '',
            last_message_at: lastMsg?.created_at || conv.updated_at,
          };
        }));
        setRecentDms(dms);
      });

    // Online friends
    supabase
      .from('friendships')
      .select('requester_id, addressee_id, profiles!friendships_addressee_id_fkey1(*)')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq('status', 'accepted')
      .then(async ({ data }) => {
        if (!data) return;
        const friendIds = (data || []).map((f: any) =>
          f.requester_id === user.id ? f.addressee_id : f.requester_id
        );
        if (friendIds.length === 0) return;
        const { data: friendProfiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', friendIds)
          .eq('status', 'online');
        setOnlineFriends((friendProfiles || []) as Profile[]);
      });

    // Pending requests count
    supabase
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .eq('addressee_id', user.id)
      .eq('status', 'pending')
      .then(({ count }) => setPendingRequests(count || 0));
  }, [user]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0810]">
      {/* Hero */}
      <div className="px-6 pt-8 pb-6 border-b border-white/5">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            {profile?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <AvatarFallback className="text-xl" style={{ backgroundColor: profile?.avatar_color || '#7c3aed', color: 'white' }}>
                {(profile?.display_name || profile?.username || 'U').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Welcome back, {profile?.display_name || profile?.username || 'friend'}.
            </h1>
            <p className="text-sm text-muted-foreground">
              {recentDms.length > 0
                ? `You have ${recentDms.length} recent conversation${recentDms.length === 1 ? '' : 's'}.`
                : 'Start a conversation with someone.'}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8 max-w-5xl">
        {/* Quick actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickAction icon={<MessageSquare className="h-5 w-5" />} label="Messages" onClick={() => setActiveView('dms')} />
          <QuickAction icon={<Users className="h-5 w-5" />} label="Friends" onClick={() => setActiveView('friends')} badge={pendingRequests > 0 ? pendingRequests : undefined} />
          <QuickAction icon={<Phone className="h-5 w-5" />} label="Calls" onClick={() => setActiveView('calls')} />
          <QuickAction icon={<Bell className="h-5 w-5" />} label="Notifications" onClick={() => setActiveView('settings')} />
        </div>

        {/* Recent DMs */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Recent Conversations</h2>
            <button onClick={() => setActiveView('dms')} className="text-xs text-nexus-lavender hover:underline">
              View all
            </button>
          </div>
          <div className="space-y-1">
            {recentDms.length === 0 ? (
              <p className="text-sm text-muted-foreground/70 py-8 text-center">
                No conversations yet.
              </p>
            ) : (
              recentDms.map((dm) => (
                <button
                  key={dm.id}
                  onClick={() => setActiveConversation(dm.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      {dm.other_user?.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={dm.other_user.avatar} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <AvatarFallback className="text-xs" style={{ backgroundColor: dm.other_user?.avatar_color || '#7c3aed', color: 'white' }}>
                          {(dm.other_user?.display_name || dm.other_user?.username || 'U').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    {dm.other_user?.status === 'online' && (
                      <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-[#0a0810]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="font-medium text-sm text-white truncate">
                      {dm.other_user?.display_name || dm.other_user?.username || 'Unknown'}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {dm.last_message || 'No messages yet'}
                    </div>
                  </div>
                  {dm.last_message_at && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(dm.last_message_at), { addSuffix: true })}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))
            )}
          </div>
        </section>

        {/* Online friends */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Online — {onlineFriends.length}
            </h2>
            <button onClick={() => setActiveView('friends')} className="text-xs text-nexus-lavender hover:underline">
              View all
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            {onlineFriends.length === 0 ? (
              <p className="text-sm text-muted-foreground/70 py-4">
                No friends online right now.
              </p>
            ) : (
              onlineFriends.slice(0, 8).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveProfileUserId(f.id)}
                  className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-white/5 transition-colors w-20"
                >
                  <div className="relative">
                    <Avatar className="h-12 w-12">
                      {f.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.avatar} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <AvatarFallback className="text-xs" style={{ backgroundColor: f.avatar_color || '#7c3aed', color: 'white' }}>
                          {(f.display_name || f.username || 'U').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-green-500 border-2 border-[#0a0810]" />
                  </div>
                  <span className="text-xs text-white/80 truncate w-full text-center">
                    {f.display_name || f.username}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function QuickAction({ icon, label, onClick, badge }: { icon: React.ReactNode; label: string; onClick: () => void; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-start gap-2 p-4 rounded-xl bg-[#13101a] hover:bg-[#1a1525] border border-white/5 transition-colors text-left"
    >
      <div className="h-10 w-10 rounded-full bg-nexus-violet/20 flex items-center justify-center text-nexus-lavender">
        {icon}
      </div>
      <span className="text-sm font-medium text-white">{label}</span>
      {badge !== undefined && (
        <span className="absolute top-2 right-2 h-5 min-w-5 px-1 rounded-full bg-nexus-violet text-white text-[10px] font-bold flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  );
}
