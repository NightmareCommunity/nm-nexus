# NM NEXUS — Database

## Schema overview

15 tables, 1 view, 1 RPC function. All tables have RLS enabled. Full schema in [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).

### Entity relationship (simplified)

```
auth.users (Supabase managed)
    │
    ├─ profiles (1:1)
    ├─ user_settings (1:1)
    ├─ devices (1:N)
    │
    ├─ conversations (created_by)
    │   ├─ conversation_members (N:M users ↔ conversations)
    │   ├─ messages (1:N)
    │   │   ├─ message_reactions (1:N)
    │   │   └─ attachments (1:N)
    │   ├─ typing (transient)
    │   └─ calls (1:N)
    │       └─ call_participants (1:N)
    │       └─ call_signaling (1:N, short-lived)
    │
    ├─ communities (owner_id)
    │   ├─ community_members (N:M users ↔ communities)
    │   ├─ channels (1:N)
    │   │   └─ channel_messages (1:N)
    │   │       (also calls can reference channel_id)
    │   └─ roles (1:N)
    │
    ├─ friendships (requester_id, addressee_id)
    ├─ blocks (blocker_id, blocked_id)
    └─ notifications (1:N)
```

## Tables

### `profiles`
User-facing profile data. One row per auth user, created by trigger on signup.
- `id` (uuid, PK, FK to auth.users)
- `username` (text, unique, 3-32 chars, alphanumeric + underscore)
- `display_name`, `avatar`, `avatar_color`, `bio` (280 char limit)
- `status` (online/away/busy/offline)
- `last_seen`, `created_at`, `updated_at`

### `user_settings`
Per-user preferences and E2EE key material. RLS restricts to owner.
- Notification prefs (messages, mentions, calls, community)
- Privacy (presence_visible, read_receipts, typing_indicators, who_can_message, who_can_call)
- Appearance (accent_color, reduced_motion)
- E2EE public keys: identity_key_public, signed_prekey_public, signed_prekey_signature
- one_time_prekeys (JSONB array — atomically consumed via RPC)
- encrypted_backup (JSONB — for future recovery feature)

### `devices`
Per-device E2EE identity. Multiple devices per user supported.
- `user_id`, `name`, `platform`
- `identity_key_public` (X25519 public key)
- `signed_prekey_public`, `signed_prekey_signature`
- `push_token` (FCM/APNs token for push notifications)
- `last_active`, `created_at`

### `conversations`
DM or group chat container.
- `type` (direct/group)
- `title`, `avatar`
- `is_encrypted` (true for DMs and private groups, false for community-adjacent)
- `group_key_wrapped` (JSONB map: user_id → wrapped group key blob)
- `created_by`, timestamps

### `conversation_members`
N:M join with role + last-read pointer.
- `conversation_id`, `user_id` (composite PK)
- `role` (owner/admin/member)
- `last_read_message_id` (for unread badge computation)
- `muted`, `joined_at`

### `messages`
Encrypted message content. RLS enforces sender must be a member.
- `id`, `client_id` (idempotency UUID — prevents duplicates on reconnect)
- `conversation_id`, `sender_id`
- `encrypted_payload` (base64 ciphertext), `encryption_nonce`, `encryption_metadata` (JSONB)
- `plaintext_body` (only for non-encrypted contexts — community channels use `channel_messages` instead)
- `message_type` (text/image/video/audio/file/voice_message/system/call_event)
- `reply_to` (self-referencing FK)
- `edited_at`, `deleted_at`, `deleted_by`
- `delivered_at`, `created_at`

### `message_reactions`
Emoji reactions, one per user per message per emoji.
- Composite PK: (message_id, user_id, reaction)

### `attachments`
File metadata for uploaded files. RLS enforces owner or conversation member.
- `message_id`, `owner_id`
- `storage_path` (in `attachments` private bucket)
- `encrypted_metadata` (for E2EE files — filename, mime encrypted client-side)
- `file_name`, `mime_type`, `file_size` (for non-encrypted community files)
- `width`, `height`, `duration_seconds` (for media)
- `thumbnail_path`

### `communities`
Discord-style server/spaces.
- `owner_id`, `name`, `slug` (unique, lowercase hyphenated)
- `description`, `icon`, `banner`
- `is_public` (discoverable)
- `invite_code` (auto-generated 10-char string)

### `community_members`
N:M join with role.
- `community_id`, `user_id` (composite PK)
- `role` (owner/admin/moderator/member)
- `nickname`, `joined_at`

### `channels`
Text/voice channels within a community.
- `community_id`, `name` (lowercase, hyphenated)
- `topic`, `type` (text/voice/announcement)
- `position` (sort order)

### `channel_messages`
Plaintext messages in community channels. NOT E2EE (subject to moderation).
- Similar structure to `messages` but with `body` (plaintext) and `channel_id` instead of `conversation_id`.

### `roles`
Custom roles within a community.
- `community_id`, `name`, `color`, `permissions` (JSONB), `position`

### `calls`
Call session record.
- `conversation_id` OR `channel_id` (exactly one set)
- `initiated_by`, `type` (voice/video)
- `status` (ringing/active/ended/missed/rejected/failed)
- `started_at`, `ended_at`

### `call_participants`
Who joined the call and when.
- `call_id`, `user_id` (composite PK)
- `joined_at`, `left_at`

### `call_signaling`
WebRTC SDP/ICE exchange. Short-lived (auto-cleanup recommended).
- `call_id`, `from_user`, `to_user`
- `signal_type` (offer/answer/ice-candidate/hangup/reject)
- `payload` (JSONB)
- RLS: only from_user or to_user can read

### `friendships`
Friend request state machine.
- `requester_id`, `addressee_id` (unique pair)
- `status` (pending/accepted/blocked/declined)
- `responded_at`

### `blocks`
Block list.
- `blocker_id`, `blocked_id` (composite PK)

### `notifications`
In-app notification feed.
- `user_id`, `type`, `title`, `body`, `payload` (JSONB)
- `read` (boolean)

### `typing`
Transient typing indicators. Should be cleaned up by scheduled job (rows older than 10s deleted).
- `conversation_id`, `user_id` (composite PK)
- `last_heartbeat`

## Views

### `device_keys`
Public projection of `devices` for E2EE key exchange. Limits columns to only what other users need to encrypt messages to you (identity, signed prekey, signature).

## RPC functions

### `fetch_prekey_bundle(target_user_id uuid)`
Atomically pops one one-time prekey from the target user's `user_settings.one_time_prekeys` array and returns the full prekey bundle (identity, signed prekey, signature, one-time prekey, device_id). Security definer — bypasses RLS for this specific operation.

## Triggers

### `on_auth_user_created`
After insert on `auth.users` → creates matching `profiles` and `user_settings` rows with a generated username (from email prefix, with uniqueness check).

### `touch_updated_at`
Before update on `profiles`, `user_settings`, `conversations`, `communities` → sets `updated_at = now()`.

## Indexes

All indexes are listed in the migration. Critical ones:
- `idx_messages_conv_created` — message pagination by conversation
- `idx_conv_members_user` — list user's conversations
- `idx_notifications_user_unread` — unread badge
- `idx_call_signaling_to_user` — recipient polls their signals
- `idx_profiles_username_lower` — case-insensitive username search

## Storage buckets

| Bucket | Public | RLS |
|---|---|---|
| `avatars` | Yes (read) | Write: only by owner (uid prefix) |
| `attachments` | No | Read: conversation members only |
| `community_assets` | Yes (read) | Write: any auth user; delete: owner |

## Realtime publication

All tables listed below are added to `supabase_realtime` publication:
- messages, channel_messages, conversations, conversation_members
- message_reactions, typing, call_signaling, call_participants, calls
- notifications, friendships, community_members, channels, profiles

Clients subscribe via channel names and receive `postgres_changes` events. RLS is enforced — clients only see events for rows they can read.

## Backup & recovery

Supabase free tier: daily backups, 7-day retention.
Pro tier: point-in-time recovery (PITR).

Database backups contain only ciphertext for E2EE messages. Without the recipient's private key (stored only on their device), backups are useless for decrypting DMs.
