# NM NEXUS — Architecture

## System overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Client (Browser / APK)                       │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ React UI    │  │ E2EE Module │  │ WebRTC      │  │ Zustand    │ │
│  │ (Next.js)   │  │ (libsodium) │  │ (calls)     │  │ stores     │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘ │
│         │                │                │               │         │
│         └────────────────┴────────┬───────┴───────────────┘         │
│                                   │                                   │
│                          Supabase JS SDK                            │
│                  (auth, postgres_changes, storage)                   │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   │ HTTPS / WSS
                                   │
┌──────────────────────────────────┴───────────────────────────────────┐
│                          Supabase Cloud                              │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ Auth (GoTrue│  │ Postgres    │  │ Realtime    │  │ Storage    │ │
│  │ / JWT)      │  │ + RLS       │  │ (WSS pubsub)│  │ (S3-like)  │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘ │
│         │                │                │               │         │
│         └────────────────┴───────┬────────┴───────────────┘         │
│                                  │                                    │
│                          Single DB cluster                          │
│                  (RLS is the security boundary)                     │
└──────────────────────────────────────────────────────────────────────┘
```

## Why this stack

**Next.js 16 + App Router** — single-page-app feel with server components for initial render. The `/` route is the entire app; navigation is client-side view state, which keeps the perceived latency near zero after the first load.

**Supabase** — replaces ~6 backend services (auth, db, realtime, storage, functions, push) with one. Free tier is generous. RLS is the security boundary — the frontend cannot bypass it even if it wanted to.

**Zustand** — minimal, no boilerplate. Used for auth state and UI state (active conversation, mobile tab, call overlay).

**libsodium** — audited, standardized crypto. We use the XChaCha20-Poly1305 + X25519 + Ed25519 primitives directly. No custom cryptography.

**WebRTC** — peer-to-peer media. No media server needed for 1:1 calls. For group calls, an SFU (mediasoup, LiveKit, or Janus) would be required — documented as a limitation.

## Data flow: sending an encrypted DM

```
1. User types message in ChatPane
2. ChatPane calls supabase.from('messages').insert({
     encrypted_payload: <ciphertext>,         // after E2EE integration
     encryption_nonce: <nonce>,
     encryption_metadata: { ephemeralKey, ... },
     sender_id: <uid>,
     conversation_id: <cid>,
   })
3. RLS policy verifies sender is a member of the conversation
4. Postgres insert triggers Realtime broadcast
5. Recipient's client receives postgres_changes event
6. Recipient's E2EE module decrypts using their private key
7. Plaintext rendered in ChatPane
```

## Data flow: WebRTC call

```
1. Caller clicks "Call" → CallOverlay mounts
2. Browser getUserMedia() → local stream
3. RTCPeerConnection created with STUN/TURN config
4. ICE candidates generated → inserted into call_signaling table
5. Recipient subscribes to call_signaling rows where to_user = them
6. Recipient creates answer → inserts into call_signaling
7. Both peers exchange ICE candidates via the table
8. WebRTC media flows P2P (or via TURN if NAT blocks P2P)
9. Hangup → close PC, stop tracks, update calls.status = 'ended'
```

## Authentication lifecycle

```
1. User submits signup form
2. supabase.auth.signUp() → creates auth.users row
3. Postgres trigger `on_auth_user_created` fires
4. Trigger inserts into public.profiles + public.user_settings
5. Client receives session JWT in cookie
6. Subsequent requests carry JWT → RLS uses auth.uid() to scope data
7. Logout → cookie cleared, session revoked
8. Re-login → fresh JWT, same profile, same conversations, same messages
```

## RLS enforcement

Every table has RLS enabled. The frontend uses only the anon key — even if a malicious user crafted requests with the anon key, they could only access rows where the RLS policy permits `auth.uid()`.

Critical policies (see `0001_init.sql` for the full list):

- `messages_select_member` — only conversation members can SELECT messages
- `messages_insert_member` — sender must be a member AND sender_id must equal auth.uid()
- `attachments_select_member` — only conversation members can SELECT attachment rows
- `call_signaling_select_to` — only from_user or to_user can read signaling rows
- `user_settings_select_self` — only the owner can read their settings
- `devices_select_self` — only the owner can list their devices

## Storage layout

```
avatars/                  (public bucket — anyone can read)
  <uid>/<filename>        (RLS: write only by uid)

attachments/              (private bucket — RLS enforced)
  <uid>/<filename>        (RLS: write by uid, read by conversation members)

community_assets/         (public bucket — anyone can read)
  <uid>/<filename>        (RLS: write by any auth user, delete by uid)
```

## Realtime channels

- `chat:<conversation_id>` — listens for INSERT/UPDATE/DELETE on messages
- `dms-list` — listens for new messages across all user's conversations
- `call_signaling:<call_id>` — WebRTC SDP/ICE exchange
- `community:<community_id>` — channel message updates (future)

Supabase Realtime respects RLS — clients only receive events for rows they can read.

## Performance considerations

- **Pagination**: messages loaded in batches of 100, infinite scroll planned
- **Throttled typing indicators**: 3-second heartbeat, no flooding
- **Debounced search**: 200–250ms debounce
- **Lazy subscription**: only the active conversation gets a Realtime subscription
- **No presence polling**: presence derived from `profiles.status` updated via Realtime events
- **Service worker**: caches app shell only, never private content

## Known scaling limits (Supabase free tier)

- 500MB database
- 1GB file storage
- 2GB bandwidth
- 50,000 monthly active users
- 200 concurrent realtime connections
- 1 signup email per hour (rate limit)

For production, upgrade to Supabase Pro ($25/mo) which lifts most of these.
