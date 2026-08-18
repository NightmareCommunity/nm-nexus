'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft, Send, Paperclip, Phone, Video, MoreVertical,
  Smile, Reply, Edit2, Trash2, Hash, Volume2, Users, X, Check, Loader2
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday } from 'date-fns';

type Message = Database['public']['Tables']['messages']['Row'];
type ChannelMessage = Database['public']['Tables']['channel_messages']['Row'];
type Conversation = Database['public']['Tables']['conversations']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];
type Reaction = Database['public']['Tables']['message_reactions']['Row'];

interface ChatMessage {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  replyTo: string | null;
  replyToBody?: string | null;
  replyToSender?: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  status: 'sending' | 'sent' | 'failed';
  reactions: { reaction: string; count: number; users: string[] }[];
  channelMessage?: boolean;
}

const EMOJIS = ['👍', '❤️', '😂', '🔥', '🎉', '😮', '😢', '🙏', '💯', '✅', '👀', '💜'];

export function ChatPane({ mobile = false }: { mobile?: boolean }) {
  const { user, profile } = useAuthStore();
  const {
    activeConversationId, activeChannelId, activeCommunityId,
    setActiveConversation, setActiveChannel, setMobileTab,
    setActiveProfileUserId, startCall, setActiveView,
  } = useUIStore();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [channelInfo, setChannelInfo] = useState<{ name: string; type: string } | null>(null);
  const [participants, setParticipants] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{
    name: string;
    size: number;
    type: string;
    preview?: string;
    path?: string;
    publicUrl?: string;
  } | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isActive = activeConversationId || activeChannelId;

  const loadAll = useCallback(async () => {
    if (!user || !isActive) return;
    const supabase = createClient();
    setLoading(true);

    if (activeConversationId) {
      // DM/group conversation
      const [{ data: conv }, { data: members }] = await Promise.all([
        supabase.from('conversations').select('*').eq('id', activeConversationId).maybeSingle(),
        supabase.from('conversation_members')
          .select('user_id, profiles!inner(*)')
          .eq('conversation_id', activeConversationId),
      ]);
      setConversation(conv);
      const profiles = (members || [])
        .map((m: any) => m.profiles as Profile)
        .filter(Boolean);
      setParticipants(profiles);

      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', activeConversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(100);

      const { data: reactions } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', (msgs || []).map((m) => m.id));

      const enriched = (msgs || []).map((m) => enrichMessage(m, reactions || [], false));
      setMessages(enriched);

      // Mark read
      if (msgs && msgs.length > 0) {
        const last = msgs[msgs.length - 1];
        await supabase.from('conversation_members')
          .update({ last_read_message_id: last.id })
          .eq('conversation_id', activeConversationId)
          .eq('user_id', user.id);
      }
    } else if (activeChannelId) {
      // Channel messages
      const { data: chan } = await supabase
        .from('channels')
        .select('name, type')
        .eq('id', activeChannelId)
        .maybeSingle();
      setChannelInfo(chan);

      // Load community members for the member panel
      if (activeCommunityId) {
        const { data: cm } = await supabase
          .from('community_members')
          .select('user_id, profiles!inner(*)')
          .eq('community_id', activeCommunityId);
        setParticipants((cm || []).map((m: any) => m.profiles as Profile).filter(Boolean));
      }

      const { data: msgs } = await supabase
        .from('channel_messages')
        .select('*')
        .eq('channel_id', activeChannelId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(100);

      const enriched = (msgs || []).map((m) => enrichMessage(m, [], true));
      setMessages(enriched);
    }

    setLoading(false);
  }, [user, activeConversationId, activeChannelId, activeCommunityId, isActive]);

  function enrichMessage(m: any, reactions: Reaction[], isChannel: boolean): ChatMessage {
    const msgReactions = reactions.filter((r) => r.message_id === m.id);
    const grouped = msgReactions.reduce((acc, r) => {
      const existing = acc.find((g) => g.reaction === r.reaction);
      if (existing) {
        existing.count++;
        existing.users.push(r.user_id);
      } else {
        acc.push({ reaction: r.reaction, count: 1, users: [r.user_id] });
      }
      return acc;
    }, [] as ChatMessage['reactions']);
    return {
      id: m.id,
      body: m.plaintext_body || m.body || '',
      senderId: m.sender_id,
      createdAt: m.created_at,
      replyTo: m.reply_to,
      editedAt: m.edited_at,
      deletedAt: m.deleted_at,
      status: 'sent',
      reactions: grouped,
      channelMessage: isChannel,
    };
  }

  useEffect(() => {
    loadAll();
    if (!user || !isActive) return;
    const supabase = createClient();

    const tableName = activeChannelId ? 'channel_messages' : 'messages';
    const filterCol = activeChannelId ? 'channel_id' : 'conversation_id';
    const filterVal = activeChannelId || activeConversationId;

    const channel = supabase
      .channel(`chat:${filterVal}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: tableName, filter: `${filterCol}=eq.${filterVal}` },
        (payload) => {
          const m = payload.new as any;
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            const enriched = enrichMessage(m, [], !!activeChannelId);
            return [...prev, enriched];
          });
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: tableName, filter: `${filterCol}=eq.${filterVal}` },
        (payload) => {
          const m = payload.new as any;
          setMessages((prev) => prev.map((x) =>
            x.id === m.id
              ? {
                  ...x,
                  body: m.plaintext_body || m.body || '',
                  editedAt: m.edited_at,
                  deletedAt: m.deleted_at,
                }
              : x
          ));
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: tableName, filter: `${filterCol}=eq.${filterVal}` },
        (payload) => {
          const old = payload.old as { id: string };
          setMessages((prev) => prev.filter((x) => x.id !== old.id));
        })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'typing', filter: `conversation_id=eq.${activeConversationId || ''}` },
        (payload) => {
          const newRow = payload.new as any;
          if (newRow && newRow.user_id !== user.id) {
            setTypingUsers((prev) => Array.from(new Set([...prev, newRow.user_id])));
            setTimeout(() => {
              setTypingUsers((prev) => prev.filter((u) => u !== newRow.user_id));
            }, 4000);
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadAll, user, activeConversationId, activeChannelId, isActive]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typingUsers]);

  // Typing indicator
  const lastTypingPing = useRef(0);
  const sendTypingPing = useCallback(async () => {
    if (!user || !activeConversationId) return;
    const now = Date.now();
    if (now - lastTypingPing.current < 3000) return;
    lastTypingPing.current = now;
    const supabase = createClient();
    await supabase.from('typing').upsert({
      conversation_id: activeConversationId,
      user_id: user.id,
      last_heartbeat: new Date().toISOString(),
    });
  }, [user, activeConversationId]);

  const sendMessage = async () => {
    if (!user || !isActive) return;
    if (!input.trim() && !pendingAttachment) return;
    setSending(true);
    let body = input.trim();
    if (pendingAttachment?.publicUrl) {
      // Append attachment link to body. If only attachment (no text), use the URL alone.
      const url = pendingAttachment.publicUrl;
      const isImage = pendingAttachment.type.startsWith('image/');
      const link = isImage ? `[image] ${url}` : `[file: ${pendingAttachment.name}] ${url}`;
      body = body ? `${body}\n${link}` : link;
    }
    if (!body) {
      setSending(false);
      return;
    }
    setInput('');
    const attachmentCopy = pendingAttachment;
    setPendingAttachment(null);
    if (editingId) {
      await doEdit(editingId, body);
      return;
    }
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      body,
      senderId: user.id,
      createdAt: new Date().toISOString(),
      replyTo: replyTo?.id || null,
      editedAt: null,
      deletedAt: null,
      status: 'sending',
      reactions: [],
      channelMessage: !!activeChannelId,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const supabase = createClient();
      if (activeChannelId) {
        const { data, error } = await supabase.from('channel_messages').insert({
          channel_id: activeChannelId,
          sender_id: user.id,
          body,
          message_type: attachmentCopy?.type.startsWith('image/') ? 'image' :
                        attachmentCopy?.type.startsWith('video/') ? 'video' :
                        attachmentCopy?.type.startsWith('audio/') ? 'audio' : 'file',
          reply_to: replyTo?.id || null,
        }).select().single();
        if (error) throw error;
        setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, id: data.id, status: 'sent', createdAt: data.created_at } : m));
      } else if (activeConversationId) {
        const { data, error } = await supabase.from('messages').insert({
          conversation_id: activeConversationId,
          sender_id: user.id,
          plaintext_body: body,
          message_type: attachmentCopy?.type.startsWith('image/') ? 'image' :
                        attachmentCopy?.type.startsWith('video/') ? 'video' :
                        attachmentCopy?.type.startsWith('audio/') ? 'audio' : 'file',
          reply_to: replyTo?.id || null,
        }).select().single();
        if (error) throw error;
        setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, id: data.id, status: 'sent', createdAt: data.created_at } : m));
      }
      setReplyTo(null);
    } catch (e: any) {
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: 'failed' } : m));
      toast.error(`Failed to send: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    if (!user) return;
    // Validate size
    const max = 25 * 1024 * 1024;
    if (file.size > max) {
      toast.error('File too large (max 25 MB)');
      return;
    }
    // Generate preview for images
    let preview: string | undefined;
    if (file.type.startsWith('image/')) {
      preview = URL.createObjectURL(file);
    }
    setPendingAttachment({
      name: file.name,
      size: file.size,
      type: file.type,
      preview,
    });
    setUploadingAttachment(true);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('attachments')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(path);
      setPendingAttachment((prev) => prev ? { ...prev, path, publicUrl } : prev);
      toast.success('Attachment ready — send your message');
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message}`);
      setPendingAttachment(null);
    } finally {
      setUploadingAttachment(false);
    }
  };

  const doEdit = async (id: string, newBody: string) => {
    if (!user) return;
    const supabase = createClient();
    const table = activeChannelId ? 'channel_messages' : 'messages';
    const update: any = { edited_at: new Date().toISOString() };
    if (activeChannelId) update.body = newBody;
    else update.plaintext_body = newBody;
    const { error } = await supabase.from(table).update(update).eq('id', id).eq('sender_id', user.id);
    if (error) toast.error(error.message);
    else setMessages((prev) => prev.map((m) => m.id === id ? { ...m, body: newBody, editedAt: new Date().toISOString() } : m));
    setEditingId(null);
  };

  const deleteMessage = async (id: string) => {
    if (!user) return;
    const supabase = createClient();
    const table = activeChannelId ? 'channel_messages' : 'messages';
    const update: any = {
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
    };
    if (activeChannelId) update.body = null;
    else update.plaintext_body = null;
    const { error } = await supabase.from(table).update(update).eq('id', id).eq('sender_id', user.id);
    if (error) toast.error(error.message);
    else setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    const supabase = createClient();
    const existing = messages.find((m) => m.id === messageId)?.reactions.find((r) => r.reaction === emoji);
    if (existing && existing.users.includes(user.id)) {
      await supabase.from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('reaction', emoji);
      setMessages((prev) => prev.map((m) => m.id === messageId ? {
        ...m,
        reactions: m.reactions
          .map((r) => r.reaction === emoji ? { ...r, count: r.count - 1, users: r.users.filter((u) => u !== user.id) } : r)
          .filter((r) => r.count > 0)
      } : m));
    } else {
      await supabase.from('message_reactions').insert({
        message_id: messageId,
        user_id: user.id,
        reaction: emoji,
      });
      setMessages((prev) => prev.map((m) => m.id === messageId ? {
        ...m,
        reactions: (() => {
          const r = m.reactions.find((x) => x.reaction === emoji);
          if (r) return m.reactions.map((x) => x.reaction === emoji ? { ...x, count: x.count + 1, users: [...x.users, user.id] } : x);
          return [...m.reactions, { reaction: emoji, count: 1, users: [user.id] }];
        })()
      } : m));
    }
  };

  const handleBack = () => {
    setActiveConversation(null);
    setActiveChannel(null);
    if (mobile) setMobileTab('chats');
  };

  if (!isActive) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0a0810]">
        <div className="text-center space-y-3 max-w-md p-6">
          <div className="text-6xl">💬</div>
          <h2 className="text-xl font-semibold text-white">No conversation selected</h2>
          <p className="text-sm text-muted-foreground">
            Pick a conversation from the sidebar, or find a friend to start a new one.
          </p>
          <Button onClick={() => setActiveView('friends')} className="gap-2">
            Find a friend
          </Button>
        </div>
      </div>
    );
  }

  // Header info
  const otherUser = participants.find((p) => p.id !== user?.id);
  const headerTitle = activeChannelId
    ? channelInfo?.name || 'channel'
    : conversation?.type === 'group'
      ? conversation.title || 'Group'
      : otherUser?.display_name || otherUser?.username || 'Unknown';
  const headerSubtitle = activeChannelId
    ? channelInfo?.type === 'voice' ? 'Voice channel' : 'Text channel'
    : otherUser?.status === 'online' ? 'Online' : 'Offline';

  return (
    <div className="flex-1 flex flex-col bg-[#0a0810] min-w-0">
      {/* Header */}
      <header className="h-12 px-4 flex items-center gap-2 border-b border-white/5 shadow-sm shrink-0">
        {mobile && (
          <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        {activeChannelId ? (
          channelInfo?.type === 'voice' ? <Volume2 className="h-4 w-4 text-muted-foreground" /> : <Hash className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Avatar className="h-6 w-6">
            {otherUser?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={otherUser.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <AvatarFallback className="text-[10px]" style={{ backgroundColor: otherUser?.avatar_color || '#7c3aed', color: 'white' }}>
                {headerTitle.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
        )}
        <span className="font-semibold text-sm text-white truncate">{headerTitle}</span>
        <span className="text-xs text-muted-foreground truncate hidden sm:inline">· {headerSubtitle}</span>
        {typingUsers.length > 0 && (
          <span className="text-xs text-nexus-lavender italic hidden md:inline">
            · {typingUsers.length} typing…
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {activeConversationId && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Voice call"
                onClick={() => otherUser && startCall('voice', { id: otherUser.id, name: otherUser.display_name || otherUser.username || 'User', avatar: otherUser.avatar || undefined })}>
                <Phone className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 hidden md:flex" aria-label="Video call"
                onClick={() => otherUser && startCall('video', { id: otherUser.id, name: otherUser.display_name || otherUser.username || 'User', avatar: otherUser.avatar || undefined })}>
                <Video className="h-4 w-4" />
              </Button>
            </>
          )}
          {activeChannelId && (
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Members">
              <Users className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>

      {/* Messages — continuous conversation layout */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">Loading messages…</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
            <div className="h-16 w-16 rounded-full bg-nexus-violet/20 flex items-center justify-center text-3xl">
              👋
            </div>
            <h3 className="text-lg font-semibold text-white">This is the start of your conversation</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Send the first message to {headerTitle}.
            </p>
          </div>
        ) : (
          <div className="py-4">
            {/* Channel welcome — only for channels, only at the top */}
            {activeChannelId && (
              <div className="px-4 pb-4 mb-2">
                <div className="h-12 w-12 rounded-full bg-nexus-violet/20 flex items-center justify-center mb-2">
                  {channelInfo?.type === 'voice' ? <Volume2 className="h-5 w-5 text-nexus-lavender" /> : <Hash className="h-5 w-5 text-nexus-lavender" />}
                </div>
                <h2 className="text-xl font-bold text-white">Welcome to #{channelInfo?.name}</h2>
                <p className="text-sm text-muted-foreground">This is the beginning of this channel.</p>
              </div>
            )}
            {messages.map((m, idx) => {
              const prev = messages[idx - 1];
              const isMine = m.senderId === user?.id;
              const sender = participants.find((p) => p.id === m.senderId);
              // Group with previous if same sender and within 5 minutes
              const grouped =
                prev && prev.senderId === m.senderId &&
                new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000 &&
                !prev.deletedAt && !m.replyTo;
              const showHeader = !grouped || m.replyTo;
              const showDateSeparator =
                !prev ||
                new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
              return (
                <div key={m.id}>
                  {showDateSeparator && (
                    <div className="flex items-center px-4 my-3">
                      <div className="flex-1 h-px bg-white/5" />
                      <span className="px-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        {formatDateSeparator(m.createdAt)}
                      </span>
                      <div className="flex-1 h-px bg-white/5" />
                    </div>
                  )}
                  <MessageRow
                    message={m}
                    isMine={isMine}
                    showHeader={showHeader}
                    sender={sender}
                    onReply={() => setReplyTo(m)}
                    onEdit={() => { setEditingId(m.id); setInput(m.body); inputRef.current?.focus(); }}
                    onDelete={() => deleteMessage(m.id)}
                    onSaveEdit={(newBody) => doEdit(m.id, newBody)}
                    isEditing={editingId === m.id}
                    onReact={(emoji) => toggleReaction(m.id, emoji)}
                    onSenderClick={() => sender && setActiveProfileUserId(sender.id)}
                  />
                </div>
              );
            })}
            {typingUsers.length > 0 && (
              <div className="px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-nexus-lavender animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-nexus-lavender animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-nexus-lavender animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                {participants.find((p) => p.id === typingUsers[0])?.display_name || 'Someone'} is typing…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="px-4 py-2 border-t border-white/5 bg-white/[0.02] flex items-center gap-2">
          <Reply className="h-3 w-3 text-nexus-lavender" />
          <div className="flex-1 text-xs truncate text-muted-foreground">
            Replying to <span className="text-white font-medium">{participants.find((p) => p.id === replyTo.senderId)?.display_name || 'Unknown'}</span>:
            <span className="ml-1">{replyTo.body.slice(0, 80)}</span>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 rounded hover:bg-white/5">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="px-4 py-3 shrink-0">
        {/* Attachment preview */}
        {pendingAttachment && (
          <div className="mb-2 flex items-center gap-2 p-2 rounded-md bg-[#1a1525] border border-white/5">
            {pendingAttachment.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pendingAttachment.preview} alt="" className="h-12 w-12 rounded object-cover" />
            ) : (
              <div className="h-12 w-12 rounded bg-white/5 flex items-center justify-center">
                <Paperclip className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{pendingAttachment.name}</div>
              <div className="text-[10px] text-muted-foreground">
                {uploadingAttachment ? 'Uploading…' : `${(pendingAttachment.size / 1024).toFixed(1)} KB`}
              </div>
            </div>
            {!uploadingAttachment && (
              <button
                onClick={() => setPendingAttachment(null)}
                className="p-1 rounded hover:bg-white/5"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
        <div className="flex items-end gap-2 bg-[#1a1525] rounded-lg px-3 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full"
            aria-label="Attach file"
            disabled={uploadingAttachment}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadingAttachment ? (
              <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,application/pdf,text/plain"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
              e.target.value = '';
            }}
          />
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); sendTypingPing(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={activeChannelId ? `Message #${channelInfo?.name}` : `Message ${headerTitle}`}
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm py-1.5 max-h-32 placeholder:text-muted-foreground"
            style={{ minHeight: '24px' }}
          />
          <Popover>
            <PopoverTrigger asChild>
              <button className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full hover:bg-white/5">
                <Smile className="h-4 w-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2">
              <div className="grid grid-cols-6 gap-1">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => { setInput((p) => p + e); }}
                    className="h-8 w-8 text-xl hover:bg-white/10 rounded flex items-center justify-center"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full bg-nexus-violet hover:bg-nexus-violet/80"
            onClick={sendMessage}
            disabled={(!input.trim() && !pendingAttachment) || sending || uploadingAttachment}
            aria-label="Send"
          >
            {editingId ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d, yyyy');
}

interface MessageRowProps {
  message: ChatMessage;
  isMine: boolean;
  showHeader: boolean;
  sender?: Profile;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSaveEdit: (newBody: string) => void;
  isEditing: boolean;
  onReact: (emoji: string) => void;
  onSenderClick: () => void;
}

function MessageRow({
  message, isMine, showHeader, sender, onReply, onEdit, onDelete, onSaveEdit, isEditing, onReact, onSenderClick
}: MessageRowProps) {
  const [editText, setEditText] = useState(message.body);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  useEffect(() => setEditText(message.body), [message.body]);

  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isDeleted = !!message.deletedAt;
  const isEdited = !!message.editedAt && !isDeleted;

  return (
    <div className="group relative px-4 hover:bg-white/[0.02] py-0.5">
      <div className="flex gap-3">
        {/* Avatar — only on first message of group */}
        <div className="w-10 shrink-0 flex justify-center">
          {showHeader ? (
            <button onClick={onSenderClick} className="mt-0.5">
              <Avatar className="h-10 w-10">
                {sender?.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sender.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <AvatarFallback className="text-xs" style={{ backgroundColor: sender?.avatar_color || '#7c3aed', color: 'white' }}>
                    {(sender?.display_name || sender?.username || 'U').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
            </button>
          ) : (
            <span className="text-[10px] text-muted-foreground/0 group-hover:text-muted-foreground/60 mt-1">
              {time}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {showHeader && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <button
                onClick={onSenderClick}
                className="text-sm font-semibold text-white hover:underline truncate"
                style={{ color: sender?.avatar_color || '#c4b5fd' }}
              >
                {sender?.display_name || sender?.username || 'Unknown'}
              </button>
              <span className="text-[10px] text-muted-foreground">{time}</span>
            </div>
          )}

          {isDeleted ? (
            <p className="text-sm italic text-muted-foreground">message deleted</p>
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
              className="bg-transparent outline-none border-b border-nexus-violet/50 text-sm w-full max-w-md"
            />
          ) : (
            <MessageBody body={message.body} isEdited={isEdited} />
          )}

          {/* Reactions */}
          {message.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {message.reactions.map((r) => (
                <button
                  key={r.reaction}
                  onClick={() => onReact(r.reaction)}
                  className={cn(
                    'flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border',
                    r.users.includes(/* user.id */ '')
                      ? 'bg-nexus-violet/20 border-nexus-violet/50'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  )}
                >
                  <span>{r.reaction}</span>
                  <span className="text-muted-foreground">{r.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hover actions */}
        {!isDeleted && (
          <div className="absolute -top-3 right-4 opacity-0 group-hover:opacity-100 transition-opacity bg-[#1a1525] border border-white/10 rounded-md shadow-lg flex">
            <Popover open={showReactionPicker} onOpenChange={setShowReactionPicker}>
              <PopoverTrigger asChild>
                <button className="p-1.5 hover:bg-white/5" aria-label="React">
                  <Smile className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-2">
                <div className="grid grid-cols-6 gap-1">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => { onReact(e); setShowReactionPicker(false); }}
                      className="h-8 w-8 text-xl hover:bg-white/10 rounded flex items-center justify-center"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <button onClick={onReply} className="p-1.5 hover:bg-white/5" aria-label="Reply">
              <Reply className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1.5 hover:bg-white/5" aria-label="More">
                  <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onReply}>
                  <Reply className="h-3 w-3 mr-2" /> Reply
                </DropdownMenuItem>
                {isMine && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit2 className="h-3 w-3 mr-2" /> Edit
                  </DropdownMenuItem>
                )}
                {isMine && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onDelete} className="text-destructive">
                      <Trash2 className="h-3 w-3 mr-2" /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Message body renderer — detects attachment markers like:
 *   `[image] https://...`     → renders image inline
 *   `[file: name] https://...` → renders download link
 * Also turns plain URLs into clickable links.
 */
function MessageBody({ body, isEdited }: { body: string; isEdited: boolean }) {
  // Split body into lines and render each
  const lines = body.split('\n');
  return (
    <div className="text-sm text-white/90 break-words">
      {lines.map((line, i) => {
        // Check for [image] URL pattern
        const imgMatch = line.match(/^\[image\]\s+(https?:\/\/\S+)$/i);
        if (imgMatch) {
          return (
            <div key={i} className="mt-1 mb-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgMatch[1]}
                alt="attachment"
                className="max-w-xs max-h-64 rounded-md border border-white/10 object-cover cursor-pointer"
                onClick={() => window.open(imgMatch[1], '_blank')}
              />
            </div>
          );
        }
        // Check for [file: name] URL pattern
        const fileMatch = line.match(/^\[file:\s*(.+?)\]\s+(https?:\/\/\S+)$/i);
        if (fileMatch) {
          return (
            <a
              key={i}
              href={fileMatch[2]}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 mt-1 rounded-md bg-white/5 border border-white/10 hover:bg-white/10 text-xs text-nexus-lavender"
            >
              <Paperclip className="h-3 w-3" />
              {fileMatch[1]}
            </a>
          );
        }
        // Plain line — render with URL detection
        return (
          <p key={i} className="whitespace-pre-wrap">
            {renderUrls(line)}
            {i === lines.length - 1 && isEdited && (
              <span className="text-[10px] text-muted-foreground ml-1 italic">(edited)</span>
            )}
          </p>
        );
      })}
    </div>
  );
}

function renderUrls(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="text-nexus-lavender hover:underline break-all"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
