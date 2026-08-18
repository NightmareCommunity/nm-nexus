// Auto-generated-style types for NM NEXUS Supabase schema (v2 — Discord-style).
// Hand-written but kept in sync with supabase/migrations/parts/*.sql.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ConversationType = 'direct' | 'group';
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'voice_message' | 'system' | 'call_event';
export type ChannelType = 'text' | 'voice' | 'announcement';
export type CallType = 'voice' | 'video';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'rejected' | 'failed';
export type FriendshipStatus = 'pending' | 'accepted' | 'blocked' | 'declined';
export type CommunityRole = 'owner' | 'admin' | 'moderator' | 'member';
export type ConversationRole = 'owner' | 'admin' | 'member';
export type ProfileStatus = 'online' | 'away' | 'busy' | 'offline';
export type NotificationType =
  | 'message' | 'mention' | 'friend_request' | 'friend_accepted'
  | 'incoming_call' | 'missed_call' | 'community_invite'
  | 'channel_activity' | 'reaction' | 'reply';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar: string | null;
          avatar_color: string;
          bio: string | null;
          status: ProfileStatus;
          custom_status: string | null;
          created_at: string;
          updated_at: string;
          last_seen: string;
          discriminator: string;
          pronouns: string | null;
          banner: string | null;
          accent_color: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          avatar?: string | null;
          avatar_color?: string;
          bio?: string | null;
          status?: ProfileStatus;
          custom_status?: string | null;
          discriminator?: string;
          pronouns?: string | null;
          banner?: string | null;
          accent_color?: string;
        };
        Update: Partial<profiles.Insert>;
      };

      user_settings: {
        Row: {
          user_id: string;
          identity_key_public: string | null;
          signed_prekey_public: string | null;
          signed_prekey_signature: string | null;
          one_time_prekeys: Json;
          notif_messages: boolean;
          notif_mentions: boolean;
          notif_calls: boolean;
          notif_community: boolean;
          presence_visible: boolean;
          read_receipts: boolean;
          typing_indicators: boolean;
          who_can_message: 'everyone' | 'friends' | 'nobody';
          who_can_call: 'everyone' | 'friends' | 'nobody';
          accent_color: string;
          reduced_motion: boolean;
          encrypted_backup: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { user_id: string; [k: string]: any };
        Update: Partial<user_settings.Insert>;
      };

      devices: {
        Row: {
          id: string;
          user_id: string;
          name: string | null;
          platform: string | null;
          identity_key_public: string;
          signed_prekey_public: string | null;
          signed_prekey_signature: string | null;
          push_token: string | null;
          last_active: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          identity_key_public: string;
          name?: string | null;
          platform?: string | null;
          signed_prekey_public?: string | null;
          signed_prekey_signature?: string | null;
          push_token?: string | null;
        };
        Update: Partial<devices.Insert>;
      };

      conversations: {
        Row: {
          id: string;
          type: ConversationType;
          title: string | null;
          avatar: string | null;
          is_encrypted: boolean;
          group_key_wrapped: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          type: ConversationType;
          title?: string | null;
          avatar?: string | null;
          is_encrypted?: boolean;
          group_key_wrapped?: Json;
          created_by?: string | null;
        };
        Update: Partial<conversations.Insert>;
      };

      conversation_members: {
        Row: {
          conversation_id: string;
          user_id: string;
          role: ConversationRole;
          last_read_message_id: string | null;
          muted: boolean;
          joined_at: string;
        };
        Insert: {
          conversation_id: string;
          user_id: string;
          role?: ConversationRole;
          last_read_message_id?: string | null;
          muted?: boolean;
        };
        Update: Partial<conversation_members.Insert>;
      };

      messages: {
        Row: {
          id: string;
          client_id: string;
          conversation_id: string;
          sender_id: string;
          encrypted_payload: string | null;
          encryption_nonce: string | null;
          encryption_metadata: Json | null;
          plaintext_body: string | null;
          message_type: MessageType;
          reply_to: string | null;
          edited_at: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          delivered_at: string | null;
          created_at: string;
          mentions: string[] | null;
        };
        Insert: {
          client_id?: string;
          conversation_id: string;
          sender_id: string;
          encrypted_payload?: string | null;
          encryption_nonce?: string | null;
          encryption_metadata?: Json | null;
          plaintext_body?: string | null;
          message_type?: MessageType;
          reply_to?: string | null;
          mentions?: string[] | null;
        };
        Update: Partial<messages.Insert>;
      };

      message_reactions: {
        Row: {
          message_id: string;
          user_id: string;
          reaction: string;
          created_at: string;
        };
        Insert: {
          message_id: string;
          user_id: string;
          reaction: string;
        };
        Update: Partial<message_reactions.Insert>;
      };

      attachments: {
        Row: {
          id: string;
          message_id: string | null;
          owner_id: string;
          storage_path: string;
          encrypted_metadata: string | null;
          file_name: string | null;
          mime_type: string | null;
          file_size: number | null;
          width: number | null;
          height: number | null;
          duration_seconds: number | null;
          thumbnail_path: string | null;
          created_at: string;
        };
        Insert: {
          message_id?: string | null;
          owner_id: string;
          storage_path: string;
          encrypted_metadata?: string | null;
          file_name?: string | null;
          mime_type?: string | null;
          file_size?: number | null;
          width?: number | null;
          height?: number | null;
          duration_seconds?: number | null;
          thumbnail_path?: string | null;
        };
        Update: Partial<attachments.Insert>;
      };

      communities: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          slug: string;
          description: string | null;
          icon: string | null;
          banner: string | null;
          is_public: boolean | null;
          invite_code: string | null;
          created_at: string;
          updated_at: string;
          vanity_url: string | null;
          member_count: number;
          is_verified: boolean;
        };
        Insert: {
          owner_id: string;
          name: string;
          slug: string;
          description?: string | null;
          icon?: string | null;
          banner?: string | null;
          is_public?: boolean | null;
          invite_code?: string | null;
          vanity_url?: string | null;
          member_count?: number;
          is_verified?: boolean;
        };
        Update: Partial<communities.Insert>;
      };

      community_members: {
        Row: {
          community_id: string;
          user_id: string;
          role: CommunityRole;
          nickname: string | null;
          joined_at: string;
          last_visited_at: string;
          notifications_enabled: boolean;
        };
        Insert: {
          community_id: string;
          user_id: string;
          role?: CommunityRole;
          nickname?: string | null;
          last_visited_at?: string;
          notifications_enabled?: boolean;
        };
        Update: Partial<community_members.Insert>;
      };

      channels: {
        Row: {
          id: string;
          community_id: string;
          name: string;
          topic: string | null;
          type: ChannelType;
          position: number;
          created_at: string;
          category_id: string | null;
          is_private: boolean;
          nsfw: boolean;
          slowmode_seconds: number;
        };
        Insert: {
          community_id: string;
          name: string;
          type: ChannelType;
          topic?: string | null;
          position?: number;
          category_id?: string | null;
          is_private?: boolean;
          nsfw?: boolean;
          slowmode_seconds?: number;
        };
        Update: Partial<channels.Insert>;
      };

      channel_messages: {
        Row: {
          id: string;
          client_id: string;
          channel_id: string;
          sender_id: string;
          body: string;
          message_type: MessageType;
          reply_to: string | null;
          edited_at: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          created_at: string;
          mentions: string[] | null;
          is_pinned: boolean;
        };
        Insert: {
          client_id?: string;
          channel_id: string;
          sender_id: string;
          body: string;
          message_type?: MessageType;
          reply_to?: string | null;
          mentions?: string[] | null;
          is_pinned?: boolean;
        };
        Update: Partial<channel_messages.Insert>;
      };

      channel_categories: {
        Row: {
          id: string;
          community_id: string;
          name: string;
          position: number;
          created_at: string;
        };
        Insert: {
          community_id: string;
          name: string;
          position?: number;
        };
        Update: Partial<channel_categories.Insert>;
      };

      roles: {
        Row: {
          id: string;
          community_id: string;
          name: string;
          color: string | null;
          permissions: Json;
          position: number;
          created_at: string;
        };
        Insert: {
          community_id: string;
          name: string;
          color?: string | null;
          permissions?: Json;
          position?: number;
        };
        Update: Partial<roles.Insert>;
      };

      friendships: {
        Row: {
          id: string;
          requester_id: string;
          addressee_id: string;
          status: FriendshipStatus;
          created_at: string;
          responded_at: string | null;
        };
        Insert: {
          requester_id: string;
          addressee_id: string;
          status?: FriendshipStatus;
          responded_at?: string | null;
        };
        Update: Partial<friendships.Insert>;
      };

      blocks: {
        Row: {
          blocker_id: string;
          blocked_id: string;
          created_at: string;
        };
        Insert: {
          blocker_id: string;
          blocked_id: string;
        };
        Update: Partial<blocks.Insert>;
      };

      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: NotificationType;
          title: string | null;
          body: string | null;
          payload: Json | null;
          read: boolean | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          type: NotificationType;
          title?: string | null;
          body?: string | null;
          payload?: Json | null;
          read?: boolean | null;
        };
        Update: Partial<notifications.Insert>;
      };

      typing: {
        Row: {
          conversation_id: string;
          user_id: string;
          last_heartbeat: string;
        };
        Insert: {
          conversation_id: string;
          user_id: string;
        };
        Update: Partial<typing.Insert>;
      };

      calls: {
        Row: {
          id: string;
          conversation_id: string | null;
          channel_id: string | null;
          initiated_by: string;
          type: CallType;
          status: CallStatus;
          started_at: string | null;
          ended_at: string | null;
          created_at: string;
        };
        Insert: {
          conversation_id?: string | null;
          channel_id?: string | null;
          initiated_by: string;
          type: CallType;
          status?: CallStatus;
          started_at?: string | null;
          ended_at?: string | null;
        };
        Update: Partial<calls.Insert>;
      };

      call_participants: {
        Row: {
          call_id: string;
          user_id: string;
          joined_at: string;
          left_at: string | null;
        };
        Insert: {
          call_id: string;
          user_id: string;
          left_at?: string | null;
        };
        Update: Partial<call_participants.Insert>;
      };

      call_signaling: {
        Row: {
          id: string;
          call_id: string;
          from_user: string;
          to_user: string;
          signal_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          call_id: string;
          from_user: string;
          to_user: string;
          signal_type: string;
          payload: Json;
        };
        Update: Partial<call_signaling.Insert>;
      };

      community_invites: {
        Row: {
          id: string;
          community_id: string;
          code: string;
          created_by: string;
          max_uses: number | null;
          uses: number;
          expires_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          community_id: string;
          code: string;
          created_by: string;
          max_uses?: number | null;
          uses?: number;
          expires_at?: string | null;
          revoked_at?: string | null;
        };
        Update: Partial<community_invites.Insert>;
      };

      read_states: {
        Row: {
          user_id: string;
          channel_id: string | null;
          conversation_id: string | null;
          last_read_message_id: string | null;
          last_read_at: string;
        };
        Insert: {
          user_id: string;
          channel_id?: string | null;
          conversation_id?: string | null;
          last_read_message_id?: string | null;
          last_read_at?: string;
        };
        Update: Partial<read_states.Insert>;
      };

      voice_states: {
        Row: {
          user_id: string;
          channel_id: string;
          community_id: string | null;
          call_id: string | null;
          self_mute: boolean;
          self_deaf: boolean;
          video: boolean;
          streaming: boolean;
          joined_at: string;
        };
        Insert: {
          user_id: string;
          channel_id: string;
          community_id?: string | null;
          call_id?: string | null;
          self_mute?: boolean;
          self_deaf?: boolean;
          video?: boolean;
          streaming?: boolean;
        };
        Update: Partial<voice_states.Insert>;
      };

      pinned_messages: {
        Row: {
          channel_id: string;
          message_id: string;
          pinned_by: string;
          pinned_at: string;
        };
        Insert: {
          channel_id: string;
          message_id: string;
          pinned_by: string;
        };
        Update: Partial<pinned_messages.Insert>;
      };

      audit_log: {
        Row: {
          id: string;
          community_id: string;
          actor_id: string | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          community_id: string;
          actor_id?: string | null;
          action: string;
          target_type?: string | null;
          target_id?: string | null;
          payload?: Json;
        };
        Update: Partial<audit_log.Insert>;
      };

      web_push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth_key: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth_key: string;
        };
        Update: Partial<web_push_subscriptions.Insert>;
      };

      message_edits: {
        Row: {
          id: string;
          message_id: string;
          conversation_message_id: string | null;
          old_body: string | null;
          edited_by: string;
          edited_at: string;
        };
        Insert: {
          message_id?: string | null;
          conversation_message_id?: string | null;
          old_body?: string | null;
          edited_by: string;
        };
        Update: Partial<message_edits.Insert>;
      };
    };

    Views: {
      [_ in never]: never;
    };

    Functions: {
      create_community_with_defaults: {
        Args: {
          p_name: string;
          p_description?: string | null;
          p_icon?: string | null;
          p_is_public?: boolean;
        };
        Returns: string;
      };
      join_community_via_invite: {
        Args: { p_code: string };
        Returns: string;
      };
      send_friend_request: {
        Args: { p_addressee_id: string };
        Returns: string;
      };
      respond_to_friend_request: {
        Args: { p_friendship_id: string; p_accept: boolean };
        Returns: boolean;
      };
      get_or_create_dm_conversation: {
        Args: { p_other_user_id: string };
        Returns: string;
      };
      leave_community: {
        Args: { p_community_id: string };
        Returns: boolean;
      };
      search_users_by_username: {
        Args: { p_query: string; p_limit?: number };
        Returns: {
          id: string;
          username: string;
          display_name: string | null;
          avatar: string | null;
          avatar_color: string;
          status: ProfileStatus;
          discriminator: string;
        }[];
      };
      fetch_prekey_bundle: {
        Args: { p_user_id: string };
        Returns: {
          identity_key: string;
          signed_prekey: string;
          signed_prekey_sig: string;
          one_time_prekey: string;
          device_id: string;
        };
      };
    };

    Enums: {
      [_ in never]: never;
    };
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type UserSettings = Database['public']['Tables']['user_settings']['Row'];
export type Community = Database['public']['Tables']['communities']['Row'];
export type CommunityMember = Database['public']['Tables']['community_members']['Row'];
export type Channel = Database['public']['Tables']['channels']['Row'];
export type ChannelCategory = Database['public']['Tables']['channel_categories']['Row'];
export type ChannelMessage = Database['public']['Tables']['channel_messages']['Row'];
export type Conversation = Database['public']['Tables']['conversations']['Row'];
export type ConversationMember = Database['public']['Tables']['conversation_members']['Row'];
export type Message = Database['public']['Tables']['messages']['Row'];
export type MessageReaction = Database['public']['Tables']['message_reactions']['Row'];
export type Friendship = Database['public']['Tables']['friendships']['Row'];
export type Block = Database['public']['Tables']['blocks']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];
export type Call = Database['public']['Tables']['calls']['Row'];
export type CallParticipant = Database['public']['Tables']['call_participants']['Row'];
export type CallSignal = Database['public']['Tables']['call_signaling']['Row'];
export type CommunityInvite = Database['public']['Tables']['community_invites']['Row'];
export type ReadState = Database['public']['Tables']['read_states']['Row'];
export type VoiceState = Database['public']['Tables']['voice_states']['Row'];
export type PinnedMessage = Database['public']['Tables']['pinned_messages']['Row'];
export type AuditLog = Database['public']['Tables']['audit_log']['Row'];
export type Role = Database['public']['Tables']['roles']['Row'];
export type Attachment = Database['public']['Tables']['attachments']['Row'];
export type Device = Database['public']['Tables']['devices']['Row'];
export type MessageEdit = Database['public']['Tables']['message_edits']['Row'];

// Convenience union for "any message" regardless of source
export type AnyMessage = {
  id: string;
  sender_id: string;
  body: string;
  message_type: MessageType;
  reply_to: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
};
