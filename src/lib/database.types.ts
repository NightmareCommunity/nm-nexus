// Auto-generated-style types matching supabase/migrations/0001_init.sql.
// Hand-written for clarity — kept in sync with the SQL migration.

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
        };
        Update: Partial<messages.Insert> & { edited_at?: string; deleted_at?: string; deleted_by?: string; delivered_at?: string };
      };
      message_reactions: {
        Row: {
          message_id: string;
          user_id: string;
          reaction: string;
          created_at: string;
        };
        Insert: { message_id: string; user_id: string; reaction: string };
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
          owner_id: string;
          storage_path: string;
          message_id?: string | null;
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
          is_public: boolean;
          invite_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          name: string;
          slug: string;
          description?: string | null;
          icon?: string | null;
          banner?: string | null;
          is_public?: boolean;
          invite_code?: string | null;
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
        };
        Insert: {
          community_id: string;
          user_id: string;
          role?: CommunityRole;
          nickname?: string | null;
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
        };
        Insert: {
          community_id: string;
          name: string;
          type?: ChannelType;
          topic?: string | null;
          position?: number;
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
        };
        Insert: {
          channel_id: string;
          sender_id: string;
          body: string;
          message_type?: MessageType;
          reply_to?: string | null;
          client_id?: string;
        };
        Update: Partial<channel_messages.Insert> & { edited_at?: string; deleted_at?: string; deleted_by?: string };
      };
      roles: {
        Row: {
          id: string;
          community_id: string;
          name: string;
          color: string;
          permissions: Json;
          position: number;
          created_at: string;
        };
        Insert: {
          community_id: string;
          name: string;
          color?: string;
          permissions?: Json;
          position?: number;
        };
        Update: Partial<roles.Insert>;
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
          initiated_by: string;
          type: CallType;
          conversation_id?: string | null;
          channel_id?: string | null;
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
        Insert: { call_id: string; user_id: string };
        Update: { left_at?: string | null };
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
      friendships: {
        Row: {
          id: string;
          requester_id: string;
          addressee_id: string;
          status: FriendshipStatus;
          created_at: string;
          responded_at: string | null;
        };
        Insert: { requester_id: string; addressee_id: string; status?: FriendshipStatus };
        Update: { status?: FriendshipStatus; responded_at?: string | null };
      };
      blocks: {
        Row: {
          blocker_id: string;
          blocked_id: string;
          created_at: string;
        };
        Insert: { blocker_id: string; blocked_id: string };
        Update: never;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: NotificationType;
          title: string | null;
          body: string | null;
          payload: Json | null;
          read: boolean;
          created_at: string;
        };
        Insert: {
          user_id: string;
          type: NotificationType;
          title?: string | null;
          body?: string | null;
          payload?: Json | null;
          read?: boolean;
        };
        Update: Partial<notifications.Insert>;
      };
      typing: {
        Row: {
          conversation_id: string;
          user_id: string;
          last_heartbeat: string;
        };
        Insert: { conversation_id: string; user_id: string };
        Update: { last_heartbeat?: string };
      };
    };
    Views: {
      device_keys: {
        Row: {
          id: string;
          user_id: string;
          identity_key_public: string;
          signed_prekey_public: string | null;
          signed_prekey_signature: string | null;
          created_at: string;
        };
      };
    };
    Functions: {
      fetch_prekey_bundle: {
        Args: { target_user_id: string };
        Returns: {
          identity_key: string;
          signed_prekey: string;
          signed_prekey_sig: string;
          one_time_prekey: string;
          device_id: string;
        }[];
      };
    };
  };
}

// Aliases for ergonomic imports.
type profiles = Database['public']['Tables']['profiles'];
type user_settings = Database['public']['Tables']['user_settings'];
type devices = Database['public']['Tables']['devices'];
type conversations = Database['public']['Tables']['conversations'];
type conversation_members = Database['public']['Tables']['conversation_members'];
type messages = Database['public']['Tables']['messages'];
type message_reactions = Database['public']['Tables']['message_reactions'];
type attachments = Database['public']['Tables']['attachments'];
type communities = Database['public']['Tables']['communities'];
type community_members = Database['public']['Tables']['community_members'];
type channels = Database['public']['Tables']['channels'];
type channel_messages = Database['public']['Tables']['channel_messages'];
type roles = Database['public']['Tables']['roles'];
type calls = Database['public']['Tables']['calls'];
type call_participants = Database['public']['Tables']['call_participants'];
type call_signaling = Database['public']['Tables']['call_signaling'];
type friendships = Database['public']['Tables']['friendships'];
type blocks = Database['public']['Tables']['blocks'];
type notifications = Database['public']['Tables']['notifications'];
type typing = Database['public']['Tables']['typing'];
