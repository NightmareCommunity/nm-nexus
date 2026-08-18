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
 */
export async function markAsRead(
  userId: string,
  opts: { conversationId?: string; channelId?: string; messageId?: string }
): Promise<void> {
  const supabase = createClient();
  const { conversationId, channelId, messageId } = opts;
  if (!conversationId && !channelId) return;

  const key = channelId
    ? { user_id: userId, channel_id: channelId, conversation_id: null }
    : { user_id: userId, channel_id: null, conversation_id: conversationId };

  const { error } = await supabase.from('read_states').upsert(
    {
      ...key,
      last_read_message_id: messageId ?? null,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,channel_id,conversation_id' }
  );
  if (error) {
    console.warn('markAsRead failed', error);
  }
}
