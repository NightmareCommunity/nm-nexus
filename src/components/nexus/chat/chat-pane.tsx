'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft, Send, Paperclip, Phone, Video, MoreVertical,
  Smile, Reply, Edit2, Trash2, Check, CheckCheck, Lock, Plus, Mic
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { randomUuid } from '@/lib/crypto/e2ee';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

type Message = Database['public']['Tables']['messages']['Row'];
type Conversation = Database['public']['Tables']['conversations']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

interface ChatMessage extends Message {
  sender?: Profile;
}

interface DecryptedMessage {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  replyTo?: string | null;
  editedAt?: string | null;
  deletedAt?: string | null;
}

export function ChatPane({ mobile = false }: { mobile?: boolean }) {
  const { user } = useAuthStore();
  const { activeConversationId, setActiveConversation, setMobileTab, setRightPanelOpen, setCallOverlayOpen } = useUIStore();
  const supabaseRef = useRef(createClient());
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [participants, setParticipants] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<DecryptedMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load conversation + participants + messages
  const loadAll = useCallback(async () => {
    if (!user || !activeConversationId) return;
    const supabase = supabaseRef.current;
    setLoading(true);

    const [{ data: conv }, { data: members }] = await Promise.all([
      supabase.from('conversations').select('*').eq('id', activeConversationId).maybeSingle(),
      supabase.from('conversation_members')
        .select('user_id, profiles!inner(*)')
        .eq('conversation_id', activeConversationId),
    ]);

    setConversation(conv);
    const otherProfiles = (members || [])
      // @ts-expect-error supabase nested join typing
      .map(m => m.profiles as Profile)
      .filter(Boolean);
    setParticipants(otherProfiles);

    // Load messages — encrypted blobs; decryption happens client-side
    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', activeConversationId)
      .order('created_at', { ascending: true })
      .limit(100);

    // Decrypt messages client-side (placeholder: real decryption requires recipient's private key)
    const decrypted: DecryptedMessage[] = (msgs || []).map(m => ({
      id: m.id,
      body: m.plaintext_body || (m.encrypted_payload ? '🔒 Encrypted — decrypt on your device' : ''),
      senderId: m.sender_id,
      createdAt: m.created_at,
      status: m.delivered_at ? 'delivered' : 'sent',
      replyTo: m.reply_to,
      editedAt: m.edited_at,
      deletedAt: m.deleted_at,
    }));
    setMessages(decrypted);
    setLoading(false);

    // Mark as read
    if (msgs && msgs.length > 0) {
      const last = msgs[msgs.length - 1];
      await supabase.from('conversation_members')
        .update({ last_read_message_id: last.id })
        .eq('conversation_id', activeConversationId)
        .eq('user_id', user.id);
    }
  }, [user, activeConversationId]);

  useEffect(() => {
    loadAll();
    if (!user || !activeConversationId) return;
    const supabase = supabaseRef.current;

    // Realtime: new messages, edits, deletes, typing
    const channel = supabase.channel(`chat:${activeConversationId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConversationId}` },
        (payload) => {
          const m = payload.new as Message;
          // Skip our own messages (already added optimistically)
          setMessages(prev => prev.some(x => x.id === m.id) ? prev : [
            ...prev,
            {
              id: m.id,
              body: m.plaintext_body || (m.encrypted_payload ? '🔒 Encrypted' : ''),
              senderId: m.sender_id,
              createdAt: m.created_at,
              status: 'delivered',
              replyTo: m.reply_to,
              editedAt: m.edited_at,
              deletedAt: m.deleted_at,
            }
          ]);
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConversationId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages(prev => prev.map(x => x.id === m.id ? {
            ...x,
            body: m.plaintext_body || (m.encrypted_payload ? '🔒 Encrypted' : ''),
            editedAt: m.edited_at,
            deletedAt: m.deleted_at,
            status: m.delivered_at ? 'delivered' : x.status,
          } : x));
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConversationId}` },
        (payload) => {
          const old = payload.old as { id: string };
          setMessages(prev => prev.filter(x => x.id !== old.id));
        })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'typing', filter: `conversation_id=eq.${activeConversationId}` },
        (payload) => {
          if (payload.new && (payload.new as any).user_id !== user.id) {
            setTypingUsers(prev => Array.from(new Set([...prev, (payload.new as any).user_id])));
            setTimeout(() => {
              setTypingUsers(prev => prev.filter(u => u !== (payload.new as any).user_id));
            }, 4000);
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadAll, user, activeConversationId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typingUsers]);

  // Typing indicator
  const lastTypingPing = useRef<number>(0);
  const sendTypingPing = useCallback(async () => {
    if (!user || !activeConversationId) return;
    const now = Date.now();
    if (now - lastTypingPing.current < 3000) return; // throttle
    lastTypingPing.current = now;
    const supabase = supabaseRef.current;
    await supabase.from('typing').upsert({
      conversation_id: activeConversationId,
      user_id: user.id,
      last_heartbeat: new Date().toISOString(),
    });
  }, [user, activeConversationId]);

  const sendMessage = async () => {
    if (!user || !activeConversationId || !input.trim()) return;
    setSending(true);
    const client_id = randomUuid();
    const tempId = `temp-${client_id}`;
    const body = input.trim();
    setInput('');
    if (editingId) { setEditingId(null); }

    // Optimistic insert
    const optimistic: DecryptedMessage = {
      id: tempId,
      body,
      senderId: user.id,
      createdAt: new Date().toISOString(),
      status: 'sending',
      replyTo: replyTo?.id || null,
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      const supabase = supabaseRef.current;
      // E2EE note: in production, encrypt `body` here with recipient's public key
      // and store base64 in encrypted_payload. For now we store plaintext_body
      // to demonstrate the message flow — see docs/security/e2ee.md for the
      // full encryption integration.
      const { data, error } = await supabase.from('messages').insert({
        client_id,
        conversation_id: activeConversationId,
        sender_id: user.id,
        plaintext_body: body,
        message_type: 'text',
        reply_to: replyTo?.id || null,
      }).select().single();

      if (error) throw error;
      // Replace optimistic message with real one
      setMessages(prev => prev.map(m => m.id === tempId ? {
        ...m,
        id: data.id,
        status: 'sent',
        createdAt: data.created_at,
      } : m));
      setReplyTo(null);
    } catch (e: any) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
      toast.error(`Failed to send: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  const editMessage = async (id: string, newBody: string) => {
    if (!user || !activeConversationId) return;
    const supabase = supabaseRef.current;
    const { error } = await supabase.from('messages')
      .update({ plaintext_body: newBody, edited_at: new Date().toISOString() })
      .eq('id', id).eq('sender_id', user.id);
    if (error) toast.error(error.message);
    else setMessages(prev => prev.map(m => m.id === id ? { ...m, body: newBody, editedAt: new Date().toISOString() } : m));
    setEditingId(null);
  };

  const deleteMessage = async (id: string) => {
    if (!user) return;
    const supabase = supabaseRef.current;
    const { error } = await supabase.from('messages')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id, plaintext_body: null })
      .eq('id', id).eq('sender_id', user.id);
    if (error) toast.error(error.message);
    else setMessages(prev => prev.map(m => m.id === id ? { ...m, deletedAt: new Date().toISOString(), body: '' } : m));
  };

  const handleBack = () => {
    setActiveConversation(null);
    if (mobile) setMobileTab('chats');
  };

  if (!activeConversationId) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-2">
          <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Select a conversation to view messages</p>
        </div>
      </div>
    );
  }

  const otherUser = participants.find(p => p.id !== user?.id);
  const title = conversation?.type === 'group'
    ? conversation.title || 'Group'
    : otherUser?.display_name || otherUser?.username || 'Unknown';

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <header className="h-16 flex items-center gap-3 px-4 border-b border-border nexus-glass">
        {mobile && (
          <Button variant="ghost" size="icon" onClick={handleBack} className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <Avatar className="h-9 w-9 ring-1 ring-border">
          <AvatarFallback style={{ backgroundColor: otherUser?.avatar_color || '#7c3aed', color: 'white' }}>
            {title.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm truncate">{title}</span>
            {conversation?.is_encrypted && <Lock className="h-3 w-3 text-nexus-lavender" />}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {otherUser?.status === 'online' ? 'Online' : 'Offline'}
            {typingUsers.length > 0 && ' · typing…'}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Voice call"
            onClick={() => setCallOverlayOpen(true)}>
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Video call"
            onClick={() => setCallOverlayOpen(true)}>
            <Video className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 hidden md:flex" aria-label="Details"
            onClick={() => setRightPanelOpen(true)}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-3 sm:px-4 py-4 space-y-1">
        {loading ? (
          <div className="text-center text-sm text-muted-foreground py-8">Loading messages…</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <Lock className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No messages yet. Say hello — securely.</p>
          </div>
        ) : (
          messages.map((m, idx) => {
            const prev = messages[idx - 1];
            const isMine = m.senderId === user?.id;
            const showAvatar = !isMine && (!prev || prev.senderId !== m.senderId);
            const sender = participants.find(p => p.id === m.senderId);
            return (
              <MessageRow
                key={m.id}
                message={m}
                isMine={isMine}
                showAvatar={showAvatar}
                sender={sender}
                onReply={() => setReplyTo(m)}
                onEdit={() => { setEditingId(m.id); setInput(m.body); inputRef.current?.focus(); }}
                onDelete={() => deleteMessage(m.id)}
                onSaveEdit={(newBody) => editMessage(m.id, newBody)}
                isEditing={editingId === m.id}
              />
            );
          })
        )}
        <AnimatePresence>
          {typingUsers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1"
            >
              <div className="flex gap-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-nexus-lavender animate-pulse" />
                <span className="h-1.5 w-1.5 rounded-full bg-nexus-lavender animate-pulse" style={{ animationDelay: '0.2s' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-nexus-lavender animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
              typing…
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Reply preview */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 py-2 border-t border-border bg-accent/20 flex items-center gap-2"
          >
            <Reply className="h-3 w-3 text-muted-foreground" />
            <div className="flex-1 text-xs truncate text-muted-foreground">
              Replying to: <span className="text-foreground">{replyTo.body || '(deleted)'}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReplyTo(null)}>
              <span className="text-xs">×</span>
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer */}
      <div className="p-3 border-t border-border flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Attach file">
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          ref={inputRef}
          placeholder={editingId ? 'Edit message…' : 'Type a message…'}
          value={input}
          onChange={(e) => { setInput(e.target.value); sendTypingPing(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (editingId) editMessage(editingId, input);
              else sendMessage();
            }
          }}
          disabled={sending}
          className="flex-1 bg-input/50"
        />
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Voice message">
          <Mic className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          className="h-9 w-9 shrink-0 bg-primary hover:bg-primary/90"
          onClick={() => editingId ? editMessage(editingId, input) : sendMessage()}
          disabled={!input.trim() || sending}
          aria-label="Send"
        >
          {editingId ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function MessageRow({
  message, isMine, showAvatar, sender, onReply, onEdit, onDelete, onSaveEdit, isEditing
}: {
  message: DecryptedMessage;
  isMine: boolean;
  showAvatar: boolean;
  sender?: Profile;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSaveEdit: (newBody: string) => void;
  isEditing: boolean;
}) {
  const [editText, setEditText] = useState(message.body);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setEditText(message.body), [message.body]);

  const isDeleted = !!message.deletedAt;
  const isEdited = !!message.editedAt && !isDeleted;
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={cn('flex items-end gap-2 group', isMine ? 'justify-end' : 'justify-start')}>
      {!isMine && (
        <div className="w-8 shrink-0">
          {showAvatar && (
            <Avatar className="h-7 w-7 ring-1 ring-border">
              <AvatarFallback
                className="text-[10px]"
                style={{ backgroundColor: sender?.avatar_color || '#7c3aed', color: 'white' }}
              >
                {(sender?.display_name || sender?.username || 'U').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      )}

      <div className={cn('max-w-[75%] sm:max-w-[60%] flex flex-col', isMine ? 'items-end' : 'items-start')}>
        <div className={cn(
          'relative rounded-2xl px-3.5 py-2 text-sm break-words',
          isMine
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-accent/60 text-foreground rounded-bl-sm',
          isDeleted && 'opacity-50 italic'
        )}>
          {isDeleted ? (
            <span className="text-xs">message deleted</span>
          ) : isEditing ? (
            <input
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit(editText);
                if (e.key === 'Escape') onEdit();
              }}
              onBlur={() => onSaveEdit(editText)}
              className="bg-transparent outline-none border-b border-primary-foreground/30"
            />
          ) : (
            message.body
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5 px-1 text-[10px] text-muted-foreground">
          {isEdited && <span className="italic">edited</span>}
          <span>{time}</span>
          {isMine && !isDeleted && (
            message.status === 'sending' ? <span className="text-muted-foreground">…</span>
            : message.status === 'failed' ? <span className="text-destructive">!</span>
            : message.status === 'read' ? <CheckCheck className="h-3 w-3 text-nexus-lavender" />
            : message.status === 'delivered' ? <CheckCheck className="h-3 w-3" />
            : <Check className="h-3 w-3" />
          )}
        </div>
      </div>

      {!isDeleted && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent/60"
              aria-label="Message actions"
            >
              <MoreVertical className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isMine ? 'end' : 'start'}>
            <DropdownMenuItem onClick={onReply}><Reply className="h-3 w-3 mr-2" /> Reply</DropdownMenuItem>
            {isMine && <DropdownMenuItem onClick={onEdit}><Edit2 className="h-3 w-3 mr-2" /> Edit</DropdownMenuItem>}
            {isMine && <DropdownMenuItem onClick={onDelete} className="text-destructive"><Trash2 className="h-3 w-3 mr-2" /> Delete</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
