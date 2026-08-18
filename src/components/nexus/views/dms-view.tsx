'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Plus, Search, Lock, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

type Conversation = Database['public']['Tables']['conversations']['Row'];
type ConversationMember = Database['public']['Tables']['conversation_members']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

interface ConversationWithMeta extends Conversation {
  otherMembers: Profile[];
  lastMessage?: Database['public']['Tables']['messages']['Row'] | null;
  unreadCount?: number;
}

export function DmsView({ mobile = false }: { mobile?: boolean }) {
  const { user } = useAuthStore();
  const { setActiveConversation, setActiveView, setMobileTab } = useUIStore();
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [newChatOpen, setNewChatOpen] = useState(false);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    // Get all conversation memberships for the user
    const { data: memberships, error } = await supabase
      .from('conversation_members')
      .select('conversation_id, last_read_message_id, muted')
      .eq('user_id', user.id);

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    if (!memberships?.length) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const convIds = memberships.map(m => m.conversation_id);
    const [{ data: convs }, { data: members }, { data: lastMsgs }] = await Promise.all([
      supabase.from('conversations').select('*').in('id', convIds),
      supabase.from('conversation_members')
        .select('conversation_id, user_id, profiles!inner(id, username, display_name, avatar, avatar_color, status)')
        .in('conversation_id', convIds),
      supabase.from('messages')
        .select('*')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const lastByConv = new Map<string, Database['public']['Tables']['messages']['Row']>();
    for (const m of lastMsgs || []) {
      if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
    }

    const readByConv = new Map(memberships.map(m => [m.conversation_id, m.last_read_message_id]));

    const result: ConversationWithMeta[] = (convs || []).map(c => {
      const otherMembers = (members || [])
        .filter(m => m.conversation_id === c.id && m.user_id !== user.id)
        // @ts-expect-error supabase nested join typing
        .map(m => m.profiles) as Profile[];
      const last = lastByConv.get(c.id) || null;
      const lastReadId = readByConv.get(c.id);
      const unread = last && lastReadId && last.id !== lastReadId ? 1 : 0;
      return { ...c, otherMembers, lastMessage: last, unreadCount: unread };
    });

    // Sort by last message time
    result.sort((a, b) => {
      const ta = a.lastMessage?.created_at || a.created_at;
      const tb = b.lastMessage?.created_at || b.created_at;
      return tb.localeCompare(ta);
    });

    setConversations(result);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConversations();
    if (!user) return;
    const supabase = createClient();
    const channel = supabase.channel('dms-list')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `sender_id=neq.${user.id}` },
        () => loadConversations())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${user.id}` },
        () => loadConversations())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadConversations, user]);

  const openConversation = (id: string) => {
    setActiveConversation(id);
    if (mobile) setMobileTab('chats');
  };

  return (
    <div className="h-full flex flex-col">
      <header className="h-16 flex items-center justify-between px-4 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-nexus-lavender" />
          <h1 className="font-semibold">Messages</h1>
        </div>
        <Button size="sm" onClick={() => setNewChatOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading conversations…</div>
        ) : conversations.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-8 w-8" />}
            title="No conversations yet"
            desc="Start a new chat to begin an end-to-end encrypted conversation."
            action={<Button size="sm" onClick={() => setNewChatOpen(true)}><Plus className="h-4 w-4 mr-1" /> New chat</Button>}
          />
        ) : (
          <div className="space-y-0.5">
            {conversations.map(conv => {
              const other = conv.otherMembers[0];
              const title = conv.type === 'group' ? conv.title : (other?.display_name || other?.username || 'Unknown');
              return (
                <button
                  key={conv.id}
                  onClick={() => openConversation(conv.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent/40 transition-colors text-left"
                >
                  <Avatar className="h-11 w-11 ring-1 ring-border">
                    <AvatarFallback
                      style={{ backgroundColor: other?.avatar_color || conv.type === 'group' ? '#7c3aed' : '#5b21b6', color: 'white' }}
                    >
                      {conv.type === 'group' ? <Users className="h-4 w-4" /> : (title || 'U').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-sm truncate">{title}</div>
                      {conv.is_encrypted && <Lock className="h-3 w-3 text-nexus-lavender shrink-0" />}
                      {conv.unreadCount ? <span className="ml-auto h-2 w-2 rounded-full bg-primary" /> : null}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {conv.lastMessage?.plaintext_body
                        || (conv.lastMessage?.encrypted_payload ? '🔒 Encrypted message' : 'No messages yet')}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {newChatOpen && <NewChatSheet onClose={() => setNewChatOpen(false)} onCreated={loadConversations} />}
    </div>
  );
}

function EmptyState({ icon, title, desc, action }: { icon: React.ReactNode; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="h-16 w-16 rounded-full bg-accent/30 flex items-center justify-center text-muted-foreground">{icon}</div>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground max-w-xs">{desc}</div>
      </div>
      {action}
    </div>
  );
}

import { Users } from 'lucide-react';
import { NewChatSheet } from '@/components/nexus/chat/new-chat-sheet';
