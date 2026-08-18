'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Send, Paperclip, Phone, Video, MoreVertical,
  Smile, Reply, Edit2, Trash2, Hash, Volume2, Users, X, Check, Loader2,
  Download, FileText, ArrowDown, Image as ImageIcon,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday } from 'date-fns';
import {
  uploadPrivateAttachment,
  createAttachmentRecord,
  fetchAttachmentsForMessages,
  getSignedAttachmentUrl,
  deleteOwnedAttachment,
  markAsRead,
  checkRateLimit,
  type AttachmentRecord,
} from '@/lib/nexus-helpers';

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
  attachments?: AttachmentRecord[];
}

const EMOJIS = ['👍', '❤️', '😂', '🔥', '🎉', '😮', '😢', '🙏', '💯', '✅', '👀', '💜'];

// Cursor pagination — 50 messages per page (matches spec).
const PAGE_SIZE = 50;

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [oldestCursor, setOldestCursor] = useState<{ createdAt: string; id: string } | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unreadMarkerId, setUnreadMarkerId] = useState<string | null>(null);

  const [pendingAttachment, setPendingAttachment] = useState<{
    name: string;
    size: number;
    type: string;
    preview?: string;
    storagePath?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    duration?: number;
  } | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevHeightRef = useRef<number>(0);

  const isActive = activeConversationId || activeChannelId;

  // ─────────────────────────────────────────────────────────────────
  // Load initial messages (latest PAGE_SIZE) + participants + reactions
  // ─────────────────────────────────────────────────────────────────
  const loadInitial = useCallback(async () => {
    if (!user || !isActive) return;
    const supabase = createClient();
    setLoading(true);
    setMessages([]);
    setHasMore(false);
    setOldestCursor(null);

    if (activeConversationId) {
      const [{ data: conv }, { data: members }] = await Promise.all([
        supabase.from('conversations').select('*').eq('id', activeConversationId).maybeSingle(),
        supabase.from('conversation_members')
          .select('user_id, profiles!inner(*), last_read_message_id')
          .eq('conversation_id', activeConversationId),
      ]);
      setConversation(conv);
      const profiles = (members || [])
        .map((m: any) => m.profiles as Profile)
        .filter(Boolean);
      setParticipants(profiles);

      // Find the user's last_read_message_id to render the unread marker
      const myMembership = (members || []).find((m: any) => m.user_id === user.id);
      const lastReadId = myMembership?.last_read_message_id || null;

      // Load latest PAGE_SIZE messages — cursor is (created_at, id) descending
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', activeConversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      // msgs are newest-first; reverse for display (oldest-first)
      const oldest = (msgs && msgs.length > 0) ? msgs[msgs.length - 1] : null;
      const oldestCur = oldest
        ? { createdAt: oldest.created_at, id: oldest.id }
        : null;

      const reversedMsgs = (msgs || []).slice().reverse();

      const { data: reactions } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', reversedMsgs.map((m) => m.id));

      // Fetch attachments via RPC (membership-checked)
      const attachmentsMap = await fetchAttachmentsForMessages(reversedMsgs.map((m) => m.id));

      const enriched = reversedMsgs.map((m) => {
        const em = enrichMessage(m, reactions || [], false);
        em.attachments = attachmentsMap.get(m.id) || [];
        return em;
      });
      setMessages(enriched);
      setOldestCursor(oldestCur);
      setHasMore((msgs || []).length === PAGE_SIZE);

      // Set unread marker: first message after last_read_message_id
      if (lastReadId) {
        const idx = enriched.findIndex((m) => m.id === lastReadId);
        if (idx >= 0 && idx + 1 < enriched.length) {
          setUnreadMarkerId(enriched[idx + 1].id);
        } else {
          setUnreadMarkerId(null);
        }
      } else {
        // No read state — marker on first message
        setUnreadMarkerId(enriched[0]?.id || null);
      }

      // Mark read up to the latest message I haven't read
      if (enriched.length > 0) {
        const last = enriched[enriched.length - 1];
        await markAsRead(user.id, {
          conversationId: activeConversationId,
          messageId: last.id,
          messageCreatedAt: last.createdAt,
        });
      }
    } else if (activeChannelId) {
      const { data: chan } = await supabase
        .from('channels')
        .select('name, type')
        .eq('id', activeChannelId)
        .maybeSingle();
      setChannelInfo(chan);

      if (activeCommunityId) {
        const { data: cm } = await supabase
          .from('community_members')
          .select('user_id, profiles!inner(*)')
          .eq('community_id', activeCommunityId);
        setParticipants((cm || []).map((m: any) => m.profiles as Profile).filter(Boolean));
      }

      // Read state for channel
      const { data: rs } = await supabase
        .from('read_states')
        .select('last_read_message_id, last_read_at')
        .eq('user_id', user.id)
        .eq('channel_id', activeChannelId)
        .maybeSingle();
      const lastReadAt = rs?.last_read_at ? new Date(rs.last_read_at).getTime() : 0;

      const { data: msgs } = await supabase
        .from('channel_messages')
        .select('*')
        .eq('channel_id', activeChannelId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      const oldest = (msgs && msgs.length > 0) ? msgs[msgs.length - 1] : null;
      const oldestCur = oldest
        ? { createdAt: oldest.created_at, id: oldest.id }
        : null;

      const reversedMsgs = (msgs || []).slice().reverse();

      const attachmentsMap = await fetchAttachmentsForMessages(reversedMsgs.map((m) => m.id));

      const enriched = reversedMsgs.map((m) => {
        const em = enrichMessage(m, [], true);
        em.attachments = attachmentsMap.get(m.id) || [];
        return em;
      });
      setMessages(enriched);
      setOldestCursor(oldestCur);
      setHasMore((msgs || []).length === PAGE_SIZE);

      // Unread marker: first message with created_at > last_read_at
      if (lastReadAt > 0) {
        const idx = enriched.findIndex((m) => new Date(m.createdAt).getTime() > lastReadAt);
        setUnreadMarkerId(idx >= 0 ? enriched[idx].id : null);
      } else if (enriched.length > 0) {
        setUnreadMarkerId(enriched[0].id);
      } else {
        setUnreadMarkerId(null);
      }

      // Mark channel read
      if (enriched.length > 0) {
        const last = enriched[enriched.length - 1];
        await markAsRead(user.id, {
          channelId: activeChannelId,
          messageId: last.id,
          messageCreatedAt: last.createdAt,
        });
      }
    }

    setLoading(false);
    setAtBottom(true);
    // Scroll to bottom on initial load
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [user, activeConversationId, activeChannelId, activeCommunityId, isActive]);

  // ─────────────────────────────────────────────────────────────────
  // Load older messages (cursor pagination, preserves scroll position)
  // ─────────────────────────────────────────────────────────────────
  const loadOlder = useCallback(async () => {
    if (!user || !isActive || !oldestCursor || loadingMore || !hasMore) return;
    const supabase = createClient();
    setLoadingMore(true);

    // Capture current scroll height so we can restore after prepending.
    const scroller = scrollRef.current;
    if (scroller) prevHeightRef.current = scroller.scrollHeight;

    const table = activeChannelId ? 'channel_messages' : 'messages';
    const filterCol = activeChannelId ? 'channel_id' : 'conversation_id';
    const filterVal = activeChannelId || activeConversationId;

    // Cursor query: created_at < oldestCursor.createdAt OR (equal AND id < oldestCursor.id)
    // We use or() to express this safely.
    const { data: older } = await supabase
      .from(table)
      .select('*')
      .eq(filterCol, filterVal as string)
      .is('deleted_at', null)
      .or(
        `created_at.lt.${oldestCursor.createdAt},` +
        `and(created_at.eq.${oldestCursor.createdAt},id.lt.${oldestCursor.id})`
      )
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (!older || older.length === 0) {
      setHasMore(false);
      setLoadingMore(false);
      return;
    }

    const newOldest = older[older.length - 1];
    setOldestCursor({ createdAt: newOldest.created_at, id: newOldest.id });
    setHasMore(older.length === PAGE_SIZE);

    const reversedOlder = older.slice().reverse();

    // Fetch attachments for the new older messages
    const attachmentsMap = await fetchAttachmentsForMessages(reversedOlder.map((m) => m.id));

    // Fetch reactions for DM path only (channel_messages don't have reactions table in current schema)
    let reactions: Reaction[] = [];
    if (!activeChannelId) {
      const { data: r } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', reversedOlder.map((m) => m.id));
      reactions = r || [];
    }

    const enrichedOlder = reversedOlder.map((m) => {
      const em = enrichMessage(m, reactions, !!activeChannelId);
      em.attachments = attachmentsMap.get(m.id) || [];
      return em;
    });

    setMessages((prev) => [...enrichedOlder, ...prev]);

    // Restore scroll position after prepending older messages.
    requestAnimationFrame(() => {
      if (scroller) {
        const newHeight = scroller.scrollHeight;
        scroller.scrollTop = newHeight - prevHeightRef.current;
      }
    });
    setLoadingMore(false);
  }, [user, isActive, oldestCursor, loadingMore, hasMore, activeChannelId, activeConversationId]);

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

  // Realtime subscriptions
  useEffect(() => {
    loadInitial();
    if (!user || !isActive) return;
    const supabase = createClient();

    const tableName = activeChannelId ? 'channel_messages' : 'messages';
    const filterCol = activeChannelId ? 'channel_id' : 'conversation_id';
    const filterVal = activeChannelId || activeConversationId;

    const channel = supabase
      .channel(`chat:${filterVal}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: tableName, filter: `${filterCol}=eq.${filterVal}` },
        async (payload) => {
          const m = payload.new as any;
          if (m.deleted_at) return;
          // Fetch attachments for the new message
          const attachmentsMap = await fetchAttachmentsForMessages([m.id]);
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            const enriched = enrichMessage(m, [], !!activeChannelId);
            enriched.attachments = attachmentsMap.get(m.id) || [];
            // If user is at the bottom, append + auto-scroll. Otherwise just append (don't mark read).
            return [...prev, enriched];
          });
          // Mark read only if user is currently viewing the bottom
          if (scrollRef.current && atBottom && user) {
            const scroller = scrollRef.current;
            const isAtBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
            if (isAtBottom) {
              if (activeChannelId) {
                await markAsRead(user.id, {
                  channelId: activeChannelId,
                  messageId: m.id,
                  messageCreatedAt: m.created_at,
                });
              } else if (activeConversationId) {
                await markAsRead(user.id, {
                  conversationId: activeConversationId,
                  messageId: m.id,
                  messageCreatedAt: m.created_at,
                });
              }
            }
          }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadInitial, user, activeConversationId, activeChannelId, isActive, atBottom]);

  // Auto-scroll to bottom on new messages, but only if user was already at bottom
  useEffect(() => {
    if (!atBottom) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typingUsers, atBottom]);

  // Track scroll position to show "Jump to Present" button
  const handleScroll = useCallback(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const distFromBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
    const isAtBottom = distFromBottom < 80;
    setAtBottom(isAtBottom);
    // If user scrolled to top, load older messages
    if (sc.scrollTop < 50 && hasMore && !loadingMore) {
      loadOlder();
    }
  }, [hasMore, loadingMore, loadOlder]);

  const jumpToPresent = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    setAtBottom(true);
    // Re-mark read
    if (user && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (activeChannelId) {
        markAsRead(user.id, { channelId: activeChannelId, messageId: last.id, messageCreatedAt: last.createdAt });
      } else if (activeConversationId) {
        markAsRead(user.id, { conversationId: activeConversationId, messageId: last.id, messageCreatedAt: last.createdAt });
      }
    }
  };

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

    // Rate limit: 30 messages per 30 seconds
    const allowed = await checkRateLimit('send_message', 30, 30);
    if (!allowed) {
      toast.error('You are sending messages too quickly. Please slow down.');
      return;
    }

    setSending(true);
    const body = input.trim();
    setInput('');

    const attachmentCopy = pendingAttachment;
    setPendingAttachment(null);
    setUploadProgress(0);

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
    // Auto-scroll on optimistic send
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });

    try {
      const supabase = createClient();
      let insertedId: string | null = null;
      let insertedCreatedAt: string | null = null;

      const messageType = attachmentCopy?.type.startsWith('image/') ? 'image' :
                          attachmentCopy?.type.startsWith('video/') ? 'video' :
                          attachmentCopy?.type.startsWith('audio/') ? 'audio' : 'file';

      if (activeChannelId) {
        const { data, error } = await supabase.from('channel_messages').insert({
          channel_id: activeChannelId,
          sender_id: user.id,
          body,
          message_type: attachmentCopy ? messageType : 'text',
          reply_to: replyTo?.id || null,
        }).select().single();
        if (error) throw error;
        insertedId = data.id;
        insertedCreatedAt = data.created_at;
      } else if (activeConversationId) {
        const { data, error } = await supabase.from('messages').insert({
          conversation_id: activeConversationId,
          sender_id: user.id,
          plaintext_body: body,
          message_type: attachmentCopy ? messageType : 'text',
          reply_to: replyTo?.id || null,
        }).select().single();
        if (error) throw error;
        insertedId = data.id;
        insertedCreatedAt = data.created_at;
      }

      // If an attachment was uploaded, create the attachments record now that we have a message_id.
      if (attachmentCopy && attachmentCopy.storagePath && insertedId) {
        const created = await createAttachmentRecord({
          messageId: insertedId,
          ownerId: user.id,
          storagePath: attachmentCopy.storagePath,
          fileName: attachmentCopy.name,
          mimeType: attachmentCopy.mimeType || attachmentCopy.type,
          fileSize: attachmentCopy.size,
          width: attachmentCopy.width,
          height: attachmentCopy.height,
          duration: attachmentCopy.duration,
        });
        if (created) {
          // Attach to the optimistic message
          setMessages((prev) => prev.map((m) => m.id === tempId ? {
            ...m,
            id: insertedId!,
            status: 'sent',
            createdAt: insertedCreatedAt!,
            attachments: [created],
          } : m));
        } else {
          // Record creation failed — orphan cleanup will eventually remove the storage object.
          toast.error('Attachment upload succeeded but the database record failed. The orphaned file will be cleaned up later.');
          setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, id: insertedId!, status: 'sent', createdAt: insertedCreatedAt! } : m));
        }
      } else {
        setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, id: insertedId!, status: 'sent', createdAt: insertedCreatedAt! } : m));
      }

      // Mark read on send
      if (insertedId && insertedCreatedAt) {
        if (activeChannelId) {
          await markAsRead(user.id, { channelId: activeChannelId, messageId: insertedId, messageCreatedAt: insertedCreatedAt });
        } else if (activeConversationId) {
          await markAsRead(user.id, { conversationId: activeConversationId, messageId: insertedId, messageCreatedAt: insertedCreatedAt });
        }
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
    // Validate size + type
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
    setUploadProgress(0);
    try {
      const result = await uploadPrivateAttachment(file, user.id, (sent, total) => {
        setUploadProgress(total > 0 ? Math.round((sent / total) * 100) : 0);
      });
      if (!result) {
        setPendingAttachment(null);
        return;
      }
      setPendingAttachment((prev) => prev ? {
        ...prev,
        storagePath: result.path,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
        duration: result.duration,
      } : prev);
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
    <div className="flex-1 flex flex-col bg-[#0a0810] min-w-0 relative">
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
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-thin relative"
      >
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
            {/* Load-older indicator at the top */}
            {hasMore && (
              <div className="flex items-center justify-center py-3">
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <button
                    onClick={loadOlder}
                    className="text-xs text-nexus-lavender hover:underline"
                  >
                    Load older messages
                  </button>
                )}
              </div>
            )}
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
              const grouped =
                prev && prev.senderId === m.senderId &&
                new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000 &&
                !prev.deletedAt && !m.replyTo;
              const showHeader = !grouped || m.replyTo;
              const showDateSeparator =
                !prev ||
                new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
              const showUnreadSeparator = m.id === unreadMarkerId;
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
                  {showUnreadSeparator && (
                    <div className="flex items-center px-4 my-2">
                      <div className="flex-1 h-px bg-nexus-violet/60" />
                      <span className="px-2 text-[10px] uppercase tracking-wider font-bold text-nexus-lavender">
                        New
                      </span>
                      <div className="flex-1 h-px bg-nexus-violet/60" />
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
                    currentUserId={user?.id}
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
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Jump to Present button — visible when scrolled up */}
      {!atBottom && !loading && messages.length > 0 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
          <Button
            onClick={jumpToPresent}
            size="sm"
            className="rounded-full bg-nexus-violet hover:bg-nexus-violet/80 shadow-lg gap-1"
          >
            <ArrowDown className="h-3 w-3" />
            Jump to Present
          </Button>
        </div>
      )}

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
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{pendingAttachment.name}</div>
              <div className="text-[10px] text-muted-foreground">
                {uploadingAttachment
                  ? `Uploading… ${uploadProgress}%`
                  : `${(pendingAttachment.size / 1024).toFixed(1)} KB · ready`}
              </div>
              {uploadingAttachment && (
                <div className="mt-1 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-nexus-violet transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
            {!uploadingAttachment && (
              <button
                onClick={() => { setPendingAttachment(null); setUploadProgress(0); }}
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
            accept="image/*,video/*,audio/*,application/pdf,text/plain,application/zip,application/msword,application/vnd.openxmlformats-officedocument.*"
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
  currentUserId?: string;
}

function MessageRow({
  message, isMine, showHeader, sender, onReply, onEdit, onDelete, onSaveEdit, isEditing, onReact, onSenderClick, currentUserId
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
            <>
              <MessageBody body={message.body} isEdited={isEdited} />
              {message.attachments && message.attachments.length > 0 && (
                <div className="mt-1 space-y-2">
                  {message.attachments.map((att) => (
                    <AttachmentView key={att.id} attachment={att} isMine={isMine} />
                  ))}
                </div>
              )}
            </>
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
                    r.users.includes(currentUserId || '')
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
 * Attachment renderer — fetches a signed URL on demand and renders
 * inline preview (image/video/audio) or download link (other types).
 */
function AttachmentView({ attachment, isMine }: { attachment: AttachmentRecord; isMine: boolean }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getSignedAttachmentUrl(attachment.storage_path, 300)
      .then((url) => {
        if (cancelled) return;
        if (url) setSignedUrl(url);
        else setFailed(true);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [attachment.storage_path]);

  const mime = attachment.mime_type || '';
  const fileName = attachment.original_filename || attachment.file_name || 'file';
  const sizeLabel = attachment.file_size
    ? attachment.file_size > 1024 * 1024
      ? `${(attachment.file_size / 1024 / 1024).toFixed(1)} MB`
      : `${(attachment.file_size / 1024).toFixed(1)} KB`
    : '';

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-md bg-white/5 max-w-xs">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading attachment…</span>
      </div>
    );
  }

  if (failed || !signedUrl) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/30 max-w-xs">
        <FileText className="h-4 w-4 text-red-400" />
        <div className="text-xs text-red-400">
          Failed to load attachment
          {isMine && (
            <button
              onClick={async () => {
                if (confirm('Delete this attachment?')) {
                  await deleteOwnedAttachment(attachment.id, attachment.storage_path);
                }
              }}
              className="ml-2 underline hover:text-red-300"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    );
  }

  // Image
  if (mime.startsWith('image/')) {
    return (
      <div className="max-w-xs max-h-80 rounded-md overflow-hidden border border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={signedUrl}
          alt={fileName}
          className="max-w-full max-h-80 object-cover cursor-pointer hover:opacity-90"
          onClick={() => window.open(signedUrl, '_blank')}
        />
      </div>
    );
  }

  // Video
  if (mime.startsWith('video/')) {
    return (
      <div className="max-w-sm rounded-md overflow-hidden border border-white/10">
        <video
          src={signedUrl}
          controls
          className="max-w-full max-h-80"
        />
      </div>
    );
  }

  // Audio
  if (mime.startsWith('audio/')) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-md bg-white/5 max-w-sm">
        <audio src={signedUrl} controls className="flex-1 h-8" />
      </div>
    );
  }

  // Generic file
  return (
    <a
      href={signedUrl}
      target="_blank"
      rel="noreferrer"
      download={fileName}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-white/5 border border-white/10 hover:bg-white/10 text-xs text-nexus-lavender max-w-sm"
    >
      <FileText className="h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <div className="truncate font-medium">{fileName}</div>
        {sizeLabel && <div className="text-[10px] text-muted-foreground">{sizeLabel}</div>}
      </div>
      <Download className="h-3 w-3 shrink-0 ml-2" />
    </a>
  );
}

/**
 * Message body renderer — turns plain URLs into clickable links.
 * (Removed: attachment markers — attachments are now first-class records.)
 */
function MessageBody({ body, isEdited }: { body: string; isEdited: boolean }) {
  if (!body) return null;
  return (
    <div className="text-sm text-white/90 break-words">
      <p className="whitespace-pre-wrap">
        {renderUrls(body)}
        {isEdited && (
          <span className="text-[10px] text-muted-foreground ml-1 italic">(edited)</span>
        )}
      </p>
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
