'use client';

import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

/**
 * Start or open a DM conversation with another user.
 * Uses the security-definer RPC `get_or_create_dm_conversation` so RLS
 * is enforced server-side and the conversation is created atomically.
 *
 * Returns the conversation_id, or null on failure.
 */
export async function startDmWithUser(otherUserId: string): Promise<string | null> {
  if (!otherUserId) return null;
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_or_create_dm_conversation', {
    p_other_user_id: otherUserId,
  });
  if (error) {
    console.error('startDmWithUser failed', error);
    toast.error(`Could not start conversation: ${error.message}`);
    return null;
  }
  return data as string;
}

/**
 * Send a friend request to another user (idempotent — if they already requested
 * us, this accepts automatically). Uses the `send_friend_request` RPC.
 */
export async function sendFriendRequest(otherUserId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.rpc('send_friend_request', {
    p_addressee_id: otherUserId,
  });
  if (error) {
    console.error('sendFriendRequest failed', error);
    toast.error(error.message);
    return false;
  }
  toast.success('Friend request sent');
  return true;
}

/**
 * Accept or decline a friend request.
 */
export async function respondToFriendRequest(
  friendshipId: string,
  accept: boolean
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.rpc('respond_to_friend_request', {
    p_friendship_id: friendshipId,
    p_accept: accept,
  });
  if (error) {
    console.error('respondToFriendRequest failed', error);
    toast.error(error.message);
    return false;
  }
  toast.success(accept ? 'Friend request accepted' : 'Friend request declined');
  return true;
}

/**
 * Remove a friendship in either direction.
 */
export async function removeFriend(otherUserId: string, currentUserId: string): Promise<boolean> {
  const supabase = createClient();
  // Single OR query — covers both requester and addressee sides.
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(
      `and(requester_id.eq.${currentUserId},addressee_id.eq.${otherUserId}),` +
      `and(requester_id.eq.${otherUserId},addressee_id.eq.${currentUserId})`
    );
  if (error) {
    console.error('removeFriend failed', error);
    toast.error(`Could not remove friend: ${error.message}`);
    return false;
  }
  toast.success('Friend removed');
  return true;
}

/**
 * Block another user. Also removes any existing friendship in either direction.
 */
export async function blockUser(otherUserId: string, currentUserId: string): Promise<boolean> {
  const supabase = createClient();
  // Remove friendship first (if any)
  await supabase
    .from('friendships')
    .delete()
    .or(
      `and(requester_id.eq.${currentUserId},addressee_id.eq.${otherUserId}),` +
      `and(requester_id.eq.${otherUserId},addressee_id.eq.${currentUserId})`
    );
  // Insert block (idempotent via primary key)
  const { error } = await supabase
    .from('blocks')
    .upsert(
      { blocker_id: currentUserId, blocked_id: otherUserId },
      { onConflict: 'blocker_id,blocked_id' }
    );
  if (error) {
    console.error('blockUser failed', error);
    toast.error(error.message);
    return false;
  }
  toast.success('User blocked');
  return true;
}

/**
 * Unblock a previously blocked user.
 */
export async function unblockUser(otherUserId: string, currentUserId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', currentUserId)
    .eq('blocked_id', otherUserId);
  if (error) {
    console.error('unblockUser failed', error);
    toast.error(error.message);
    return false;
  }
  toast.success('User unblocked');
  return true;
}

/**
 * Create a community with default channels + owner membership.
 * Uses the `create_community_with_defaults` RPC.
 */
export async function createCommunity(opts: {
  name: string;
  description?: string;
  icon?: string;
  isPublic?: boolean;
}): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_community_with_defaults', {
    p_name: opts.name,
    p_description: opts.description ?? null,
    p_icon: opts.icon ?? null,
    p_is_public: opts.isPublic ?? true,
  });
  if (error) {
    console.error('createCommunity failed', error);
    toast.error(`Could not create community: ${error.message}`);
    return null;
  }
  toast.success(`Community "${opts.name}" created`);
  return data as string;
}

/**
 * Join a community via invite code.
 */
export async function joinCommunityByInvite(code: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('join_community_via_invite', {
    p_code: code.trim(),
  });
  if (error) {
    console.error('joinCommunityByInvite failed', error);
    toast.error(error.message);
    return null;
  }
  toast.success('Joined community');
  return data as string;
}

/**
 * Leave a community.
 */
export async function leaveCommunity(communityId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.rpc('leave_community', {
    p_community_id: communityId,
  });
  if (error) {
    console.error('leaveCommunity failed', error);
    toast.error(error.message);
    return false;
  }
  toast.success('Left community');
  return true;
}

/**
 * Search users by username/display_name for the "Add Friend" flow.
 */
export async function searchUsers(query: string, limit = 10) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('search_users_by_username', {
    p_query: query,
    p_limit: limit,
  });
  if (error) {
    console.error('searchUsers failed', error);
    return [];
  }
  return data as {
    id: string;
    username: string;
    display_name: string | null;
    avatar: string | null;
    avatar_color: string;
    status: string;
    discriminator: string;
  }[];
}

/**
 * Mark a conversation/channel as read up to a given message.
 * Uses the SECURITY DEFINER `mark_message_read` RPC for atomicity + membership check.
 */
export async function markAsRead(
  userId: string,
  opts: { conversationId?: string; channelId?: string; messageId?: string; messageCreatedAt?: string }
): Promise<void> {
  const supabase = createClient();
  const { conversationId, channelId, messageId, messageCreatedAt } = opts;
  if (!conversationId && !channelId) return;

  const { error } = await supabase.rpc('mark_message_read', {
    p_conversation_id: conversationId ?? null,
    p_channel_id: channelId ?? null,
    p_message_id: messageId ?? null,
    p_message_created_at: messageCreatedAt ?? null,
  });
  if (error) {
    // Fallback to direct upsert for resilience (the RPC may be missing in older deploys).
    console.warn('mark_message_read RPC failed, falling back to direct upsert', error);
    const key = channelId
      ? { user_id: userId, channel_id: channelId, conversation_id: null }
      : { user_id: userId, channel_id: null, conversation_id: conversationId };
    await supabase.from('read_states').upsert(
      {
        ...key,
        last_read_message_id: messageId ?? null,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,channel_id,conversation_id' }
    );
  }
}

/**
 * Fetch unread counts (DMs + channels + mentions) for the current user.
 * Returns a map keyed by conversation_id or channel_id.
 */
export async function fetchUnreadCounts(): Promise<{
  byConversation: Map<string, { count: number; mention: boolean }>;
  byChannel: Map<string, { count: number; mention: boolean }>;
}> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('fetch_unread_counts');
  if (error || !data) {
    return { byConversation: new Map(), byChannel: new Map() };
  }
  const byConversation = new Map<string, { count: number; mention: boolean }>();
  const byChannel = new Map<string, { count: number; mention: boolean }>();
  for (const row of data as any[]) {
    if (row.conversation_id) {
      byConversation.set(row.conversation_id, {
        count: row.unread_count ?? 0,
        mention: !!row.has_mention,
      });
    } else if (row.channel_id) {
      byChannel.set(row.channel_id, {
        count: row.unread_count ?? 0,
        mention: !!row.has_mention,
      });
    }
  }
  return { byConversation, byChannel };
}

// ─────────────────────────────────────────────────────────────────────
// PRIVATE ATTACHMENTS — upload to private Storage, create attachments
// record, fetch via short-lived signed URLs.
// ─────────────────────────────────────────────────────────────────────

export interface AttachmentRecord {
  id: string;
  message_id: string | null;
  owner_id: string;
  storage_path: string;
  file_name: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  thumbnail_path: string | null;
  created_at: string;
}

const ATTACHMENT_BUCKET = 'attachments';
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME_PREFIXES = [
  'image/', 'video/', 'audio/', 'application/pdf', 'text/plain',
  'application/zip', 'application/msword',
  'application/vnd.openxmlformats-officedocument',
];

export function validateAttachment(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) return 'File too large (max 25 MB)';
  if (file.size === 0) return 'File is empty';
  const ok = ALLOWED_MIME_PREFIXES.some((p) => file.type.startsWith(p));
  if (!ok) return `File type "${file.type || 'unknown'}" is not allowed`;
  return null;
}

/**
 * Upload a file to the private attachments bucket under the user's own folder.
 * Returns the storage_path (relative to bucket) — NOT a public URL.
 */
export async function uploadPrivateAttachment(
  file: File,
  ownerUserId: string,
  onProgress?: (sent: number, total: number) => void
): Promise<{ path: string; mimeType: string; size: number; width?: number; height?: number; duration?: number } | null> {
  const validationError = validateAttachment(file);
  if (validationError) {
    toast.error(validationError);
    return null;
  }
  const supabase = createClient();
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const sanitized = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${ownerUserId}/${sanitized}`;

  // Supabase JS v2 doesn't support per-chunk progress callbacks; simulate via file size.
  // For real progress we'd need a custom XHR. For now, call onProgress once at start and once at end.
  onProgress?.(0, file.size);

  const { error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });
  if (error) {
    toast.error(`Upload failed: ${error.message}`);
    return null;
  }
  onProgress?.(file.size, file.size);

  // For images, capture dimensions
  let width: number | undefined;
  let height: number | undefined;
  if (file.type.startsWith('image/')) {
    try {
      const dims = await getImageDimensions(file);
      width = dims.width;
      height = dims.height;
    } catch { /* non-fatal */ }
  }

  // For audio/video, capture duration
  let duration: number | undefined;
  if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
    try {
      duration = await getMediaDuration(file);
    } catch { /* non-fatal */ }
  }

  return { path, mimeType: file.type, size: file.size, width, height, duration };
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function getMediaDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = file.type.startsWith('audio/')
      ? new Audio()
      : document.createElement('video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const d = el.duration;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    el.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    el.src = url;
  });
}

/**
 * Create an `attachments` row linking a stored file to a message.
 * Server-side RLS enforces that owner_id = auth.uid() and message_id belongs to a
 * conversation/channel the user is a member of.
 */
export async function createAttachmentRecord(opts: {
  messageId: string;
  ownerId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  width?: number;
  height?: number;
  duration?: number;
}): Promise<AttachmentRecord | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from('attachments').insert({
    message_id: opts.messageId,
    owner_id: opts.ownerId,
    storage_path: opts.storagePath,
    file_name: opts.fileName,
    original_filename: opts.fileName,
    mime_type: opts.mimeType,
    file_size: opts.fileSize,
    width: opts.width ?? null,
    height: opts.height ?? null,
    duration_seconds: opts.duration ?? null,
  }).select().maybeSingle();
  if (error) {
    console.error('createAttachmentRecord failed', error);
    toast.error(`Attachment record failed: ${error.message}`);
    return null;
  }
  return data as AttachmentRecord;
}

/**
 * Fetch authorized attachments for a batch of message IDs.
 * Uses the SECURITY DEFINER `fetch_message_attachments` RPC so the server
 * only returns attachments the caller is allowed to see.
 */
export async function fetchAttachmentsForMessages(
  messageIds: string[]
): Promise<Map<string, AttachmentRecord[]>> {
  if (messageIds.length === 0) return new Map();
  const supabase = createClient();
  const { data, error } = await supabase.rpc('fetch_message_attachments', {
    p_message_ids: messageIds,
  });
  if (error) {
    console.warn('fetch_message_attachments failed', error);
    return new Map();
  }
  const map = new Map<string, AttachmentRecord[]>();
  for (const row of (data as AttachmentRecord[]) || []) {
    if (!row.message_id) continue;
    const list = map.get(row.message_id) || [];
    list.push(row);
    map.set(row.message_id, list);
  }
  return map;
}

/**
 * Get a short-lived signed URL for downloading / previewing a private attachment.
 * URL expires after `expiresIn` seconds (default 60).
 */
export async function getSignedAttachmentUrl(
  storagePath: string,
  expiresIn = 60
): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) {
    console.warn('createSignedUrl failed', error);
    return null;
  }
  return data.signedUrl;
}

/**
 * Delete an owned attachment record + the underlying Storage object.
 */
export async function deleteOwnedAttachment(
  attachmentId: string,
  storagePath: string
): Promise<boolean> {
  const supabase = createClient();
  // Delete Storage object first (owner has DELETE on their own folder).
  const { error: storageErr } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .remove([storagePath]);
  if (storageErr) {
    console.warn('storage remove failed (continuing to delete DB record)', storageErr);
  }
  // Delete DB record via RPC (server checks owner_id = auth.uid()).
  const { error } = await supabase.rpc('delete_owned_attachment', {
    p_attachment_id: attachmentId,
  });
  if (error) {
    toast.error(`Could not delete attachment: ${error.message}`);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// COMMUNITY INVITES — create, list, revoke, join atomically.
// ─────────────────────────────────────────────────────────────────────

export interface CommunityInviteRow {
  id: string;
  community_id: string;
  code: string;
  created_by: string;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export async function createCommunityInvite(opts: {
  communityId: string;
  maxUses?: number | null;
  expiresInHours?: number | null;
}): Promise<CommunityInviteRow | null> {
  const supabase = createClient();
  const expiresAt = opts.expiresInHours
    ? new Date(Date.now() + opts.expiresInHours * 3600 * 1000).toISOString()
    : null;
  const { data, error } = await supabase.rpc('create_community_invite', {
    p_community_id: opts.communityId,
    p_max_uses: opts.maxUses ?? null,
    p_expires_at: expiresAt,
  });
  if (error) {
    toast.error(`Could not create invite: ${error.message}`);
    return null;
  }
  // Fetch the created invite row by id
  const { data: row, error: fetchErr } = await supabase
    .from('community_invites')
    .select('*')
    .eq('id', data as string)
    .maybeSingle();
  if (fetchErr || !row) {
    console.warn('created invite but could not fetch row', fetchErr);
    return null;
  }
  return row as CommunityInviteRow;
}

export async function listCommunityInvites(communityId: string): Promise<CommunityInviteRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('community_invites')
    .select('*')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('listCommunityInvites failed', error);
    return [];
  }
  return (data || []) as CommunityInviteRow[];
}

export async function revokeCommunityInvite(inviteId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.rpc('revoke_community_invite', {
    p_invite_id: inviteId,
  });
  if (error) {
    toast.error(`Could not revoke invite: ${error.message}`);
    return false;
  }
  toast.success('Invite revoked');
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// CHANNEL CATEGORIES — create, reorder, delete channels safely.
// ─────────────────────────────────────────────────────────────────────

export async function createChannelCategory(communityId: string, name: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_channel_category', {
    p_community_id: communityId,
    p_name: name,
  });
  if (error) {
    toast.error(`Could not create category: ${error.message}`);
    return null;
  }
  return data as string;
}

export async function deleteChannelSafely(channelId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.rpc('delete_channel', {
    p_channel_id: channelId,
  });
  if (error) {
    toast.error(`Could not delete channel: ${error.message}`);
    return false;
  }
  toast.success('Channel deleted');
  return true;
}

export async function renameChannel(channelId: string, newName: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('channels')
    .update({ name: newName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '') })
    .eq('id', channelId);
  if (error) {
    toast.error(`Could not rename channel: ${error.message}`);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// RATE LIMITING — thin wrapper around check_rate_limit RPC.
// ─────────────────────────────────────────────────────────────────────

export async function checkRateLimit(
  action: string,
  max: number,
  windowSeconds: number
): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_action: action,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    // Fail-open: if rate limiter is unavailable, allow the action.
    return true;
  }
  return !!data;
}

// ─────────────────────────────────────────────────────────────────────
// E2EE — Device Key Bundle publishing (PREVIEW, NOT WIRED TO CHAT FLOW).
//
// These helpers let a user publish their device's PUBLIC key material to the
// server so future E2EE-capable clients can fetch it. The actual chat flow
// still uses plaintext_body + TLS + RLS — these helpers exist to prepare the
// ground for a future E2EE release. See src/lib/crypto/e2ee.ts.
// ─────────────────────────────────────────────────────────────────────

export interface DeviceBundleStatus {
  has_bundle: boolean;
  published_at?: string;
  rotated_at?: string | null;
  remaining_one_time_prekeys?: number;
}

export async function getMyDeviceBundleStatus(): Promise<DeviceBundleStatus | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_my_device_bundle_status');
  if (error) {
    console.warn('getMyDeviceBundleStatus failed', error);
    return null;
  }
  return data as DeviceBundleStatus;
}

export async function publishDeviceKeys(
  identityPublicKey: string,
  signedPreKeyPublic: string,
  signedPreKeySignature: string,
  oneTimePreKeys: { key_id: string; public: string }[]
): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('publish_device_keys', {
    p_identity_public_key: identityPublicKey,
    p_signed_prekey_public: signedPreKeyPublic,
    p_signed_prekey_signature: signedPreKeySignature,
    p_one_time_prekeys: oneTimePreKeys,
  });
  if (error) {
    console.error('publishDeviceKeys failed', error);
    toast.error(`Failed to publish device keys: ${error.message}`);
    return null;
  }
  return data as string;
}

export async function replenishOneTimePreKeys(
  newPreKeys: { key_id: string; public: string }[]
): Promise<number | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('replenish_one_time_prekeys', {
    p_new_prekeys: newPreKeys,
  });
  if (error) {
    console.error('replenishOneTimePreKeys failed', error);
    return null;
  }
  return data as number;
}

export async function revokeDeviceKeys(): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('revoke_device_keys');
  if (error) {
    console.error('revokeDeviceKeys failed', error);
    toast.error(`Failed to revoke device keys: ${error.message}`);
    return false;
  }
  return !!data;
}

export interface RecipientPreKeyBundle {
  identity_key: string;
  signed_prekey: string;
  signed_prekey_sig: string;
  one_time_prekey: string | null;
  device_id: string;
}

export async function fetchRecipientBundle(
  recipientId: string
): Promise<RecipientPreKeyBundle | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('fetch_prekey_bundle', {
    p_recipient_id: recipientId,
  });
  if (error) {
    console.error('fetchRecipientBundle failed', error);
    return null;
  }
  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  return Array.isArray(data) ? (data[0] as RecipientPreKeyBundle) : (data as RecipientPreKeyBundle);
}
