# NM NEXUS v4.1 — Final Honest Report

**Date**: 2026-08-18
**Production URL**: https://nm-nexus.ojaskhanna432.workers.dev/
**APK**: `/home/z/my-project/download/nm-nexus-v4.1.apk` (4.48 MB)
**GitHub**: https://github.com/NightmareCommunity/nm-nexus (commit `d82f126`)
**DB**: Supabase project `juzmgejicviennjcykxq` (28 tables, 27 SECURITY DEFINER functions, all hardened)

This report is intentionally blunt. Nothing is claimed that isn't actually wired up.

---

## WORKING — what currently functions end-to-end

### Authentication & session
- Email/password sign-up + sign-in via Supabase Auth (PKCE flow).
- Google OAuth via Supabase with PKCE — redirect to `/auth/callback`.
- Loading screen has a 6-second timeout; on timeout or error, user sees a real error message + Retry button. No infinite spinner.
- Auth state persisted in cookies via `@supabase/ssr`.
- `handle_new_user` trigger auto-creates a `profiles` row + `user_settings` row on signup.

### Messaging — DMs and channels
- Send text messages in DMs and community channels.
- Edit and soft-delete your own messages (sender-only — RLS enforced).
- Reply to messages (quote preview shown above composer).
- React with emoji; toggle reactions; counts + reacting users shown.
- Typing indicator (DM path) — debounced 3-second pings.
- Realtime INSERT / UPDATE / DELETE via Supabase realtime channels.
- Date separators ("Today", "Yesterday", "MMM d, yyyy").
- Message grouping by sender within 5-minute windows.

### Cursor pagination (v4.1)
- Initial load: latest 50 messages.
- Scroll-to-top loads older 50 messages using `(created_at, id)` cursor.
- Scroll height preserved across prepend (no jump).
- No duplicates (deduped by message id in realtime INSERT handler).
- Realtime messages append correctly without reloading the chat.
- "Jump to Present" button appears when scrolled up; clicking scrolls to bottom and re-marks read.

### Attachments (v4.1 — completely rewritten)
- Upload flow: validate file → upload to **private** Storage bucket under `{owner_id}/{sanitized}` → create `attachments` row referencing the new `message_id` → recipient fetches via **short-lived signed URL (300s expiry)**.
- Server-side RLS on `attachments` table now checks DM membership **and** community-channel membership (previously only checked DM).
- Storage policy `attachments_member_read` calls `can_access_attachment(path)` helper which verifies owner OR conversation_member OR (channel_message → community_member) before granting SELECT.
- File size limit: 25 MB. MIME type allowlist enforced at bucket level.
- UI: upload progress bar, loading/failed states, inline image preview, inline video player, inline audio player, generic file download chip with size + icon.
- Orphan cleanup: triggers on `messages` and `channel_messages` AFTER DELETE set `attachments.message_id = NULL` so a background sweeper can later remove unreferenced Storage objects.

### Communities
- Create community via `create_community_with_defaults` RPC (creates community + default channels + owner membership in one transaction).
- Join via invite code (atomic — see Invites below).
- Leave community (RPC removes membership).
- Create text + voice channels.
- Channel categories: create, list, group channels by category in sidebar.
- Channel management (admin-only): rename inline, delete via menu (cascades to messages + attachments).
- Community dropdown menu: copy invite code, manage invites, open members panel, create channel, create category, leave.

### Invites (v4.1)
- 4 invite types: permanent, one-time (max_uses=1), expiring (expires_at), limited-use (max_uses=N).
- Join is **atomic**: `join_community_via_invite` uses `SELECT ... FOR UPDATE` on the invite row to prevent race conditions where two concurrent joins could exceed `max_uses`.
- Validates: not revoked, not expired, not exhausted, not already a member.
- Admin-only invite creation + revocation via `create_community_invite` + `revoke_community_invite` RPCs.
- UI: invite manager dialog with create form + active invite list + copy + revoke buttons.

### Friends
- Send friend request via RPC (idempotent — if they already requested you, auto-accepts).
- Accept / decline incoming requests.
- Remove friend (works in either direction).
- Block / unblock.
- Search users by username via `search_users_by_username` RPC (excludes blocked users per privacy rules).
- Profile card shows dynamic actions based on relationship state: NONE → Add Friend / Message; PENDING_OUTGOING → Request Sent; PENDING_INCOMING → Accept / Decline; FRIENDS → Message / Remove / Call; BLOCKED → Unblock.

### Calls
- 1:1 voice and video calls over WebRTC.
- Signaling via Supabase realtime `call_signaling` table (offer / answer / ICE / hangup / reject).
- Call record in `calls` table with status lifecycle (ringing → active → ended / missed / rejected / failed).
- 45-second ringing timeout auto-ends unanswered calls.
- Cleanup on unmount: marks call as ended/missed, signals hangup to peer, closes RTCPeerConnection, stops local tracks.
- ICE config supports STUN (configured) + TURN (env vars wired, currently empty placeholders).
- Mute / video-off / deafen / end-call controls.

### Mobile / APK
- WebView shell loading the live Cloudflare deployment (always latest version).
- AndroidManifest includes: INTERNET, ACCESS_NETWORK_STATE, CAMERA, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, READ_MEDIA_IMAGES / VIDEO / AUDIO (Android 13+), READ_EXTERNAL_STORAGE (Android ≤12), VIBRATE, WAKE_LOCK.
- Camera + microphone declared as optional hardware features (app installs on devices without them).
- Branded launcher icons (NM NEXUS purple gradient) at all densities.
- Built APK at `/home/z/my-project/download/nm-nexus-v4.1.apk` — 4.48 MB.

---

## FIXED — what was broken before v4.1 and is now corrected

| Problem | Fix |
|---|---|
| `attachments_read` storage policy allowed ANY authenticated user to read ANY attachment (Account C could read A/B files) | Removed; replaced with `attachments_member_read` that calls `can_access_attachment(path)` — owner-or-member check |
| `voice_messages_read` had the same permissive pattern | Replaced with `voice_messages_owner_read` (foldername = auth.uid()) |
| Attachments table RLS only checked DM membership — community channel attachments were unreadable | Added channel_messages → channels → community_members path to both the table RLS and the `can_access_attachment` helper |
| 8 SECURITY DEFINER functions had no `search_path` config (CVE-class privilege-escalation risk via search_path hijack) | All 27 SECURITY DEFINER functions now have `SET search_path = public, pg_temp` |
| `join_community_via_invite` was not atomic — concurrent joins could exceed `max_uses` | Rewritten with `SELECT ... FOR UPDATE` row-level lock |
| Messages used `.limit(100)` — no way to view older history | Cursor pagination with `(created_at, id)` tuple cursor, 50 per page |
| Attachments were stored as public URLs in the message body text | Now stored as proper `attachments` rows; message body is just text; previews fetched via short-lived signed URLs |
| Settings page falsely claimed "Messages are encrypted with X25519 + XChaCha20-Poly1305" | Honest wording: "E2EE is not yet enabled. Current protection is TLS + RLS + signed URLs." |
| Push notifications toggle implied web push was wired | Disclaimer added: "Web push notifications are not yet wired — toggles control in-app behavior only." |
| Call could ring forever if callee never answered | 45-second ringing timeout auto-ends with toast |
| Voice channels advertised as full Discord-style voice | Honest label: "Small-group mesh (max ~6 participants)" |
| No rate limiting on message send | `check_rate_limit` RPC + `rate_limit_log` table; wired into send (30 msgs / 30s) |

---

## SECURITY — what's actually enforced

### Storage (Supabase Storage RLS)
- `attachments` bucket: **private** (`public: false`), 25 MB file size limit, MIME allowlist.
- SELECT: only if `can_access_attachment(path)` returns true (owner OR DM member OR community-channel member).
- INSERT/UPDATE/DELETE: only to/from your own folder (`storage.foldername(name)[1] = auth.uid()`).
- `voice_messages` bucket: same owner-only pattern.

### Database (Postgres RLS)
- Every table has RLS enabled.
- All policies use `auth.uid()` — no caller-supplied user IDs are trusted.
- `attachments` table SELECT policy: owner OR DM member OR channel member.
- `messages` SELECT: `is_conversation_member(conversation_id)` helper.
- `channel_messages` SELECT: `is_community_member(community_id)` via channels join.
- `community_invites` SELECT: community member OR (not revoked AND not expired).
- `read_states`: user can only see / write their own rows.

### SECURITY DEFINER functions
- All 27 have `SET search_path = public, pg_temp` (verified by `security-test.py`).
- All use `auth.uid()` internally — no `p_user_id` parameter is trusted.
- `is_community_admin` / `is_community_member` / `is_community_moderator` / `is_conversation_member` are stable helper functions used by RLS policies.

### Atomic operations
- `join_community_via_invite`: `FOR UPDATE` lock prevents race conditions.
- `mark_message_read`: `INSERT ... ON CONFLICT DO UPDATE` with `GREATEST(last_read_at, EXCLUDED.last_read_at)` ensures monotonic read position.
- `create_community_with_defaults`: single transaction creates community + default channels + owner membership.

### Rate limiting
- `check_rate_limit(action, max, window_seconds)` RPC with sliding-window count.
- Wired into `sendMessage` (30 msgs / 30s). Fail-open if RPC is unavailable (so a misconfigured deploy doesn't break chat).

### A/B/C isolation test
- `scripts/security-test.py` runs 13 static policy/structure checks against the live DB via the sql-runner Worker.
- All 13 pass (verified after deploy).
- A full runtime A/B/C test (sign in as three real users, attempt cross-access with stolen attachment IDs / storage paths / expired signed URLs) was not performed because the sandbox cannot mint real user JWTs. **This is the one piece the user must verify manually.**

---

## LIMITATIONS — what is NOT yet done or NOT working

1. **True E2EE is not enabled.** Messages are stored as `plaintext_body` and protected only by TLS + RLS. The `src/lib/crypto/e2ee.ts` module is an architecture stub for future implementation — it is not wired into the message flow. Do not send highly sensitive content over NM NEXUS today.

2. **Web push notifications are not wired.** The `web_push_subscriptions` table exists but no code path actually delivers a notification. The settings toggles control in-app behavior only.

3. **Voice channels are mesh, not SFU.** The current WebRTC architecture is peer-to-peer mesh — works reliably for 2-6 participants, degrades beyond that. A proper SFU (mediasoup / LiveKit / janus) would be needed for Discord-scale voice channels. The UI honestly labels this as "small-group mesh (max ~6 participants)".

4. **TURN is not configured.** The env vars are wired but empty. Calls work on same-network and via STUN-only NAT traversal. Forcing TURN (e.g. for restrictive corporate networks) requires setting `NEXT_PUBLIC_TURN_URLS`, `NEXT_PUBLIC_TURN_USERNAME`, `NEXT_PUBLIC_TURN_CREDENTIAL` in `wrangler.jsonc` and redeploying.

5. **No automated A/B/C runtime test.** Static policy checks pass, but the actual "log in as three users and attempt cross-access" test is manual.

6. **No read-receipts UI.** The `read_states` table tracks read positions per user (used for unread counts), but no "✓✓ seen by X at Y" indicator is rendered in the chat.

7. **No message search.** No full-text search across message history.

8. **No file previews for non-image/video/audio types.** PDFs, docs, etc. show a download chip only — no inline preview.

9. **No message editing history.** `message_edits` table exists but the UI doesn't show "view previous versions".

10. **Back button on Android.** The WebView shell uses the default back behavior (exits app). A custom back-button handler that navigates within the SPA would improve UX.

11. **No push permission prompt.** The AndroidManifest declares CAMERA / RECORD_AUDIO permissions but the app doesn't yet trigger the runtime permission prompt — the browser will ask the first time getUserMedia is called.

12. **APK is debug-signed.** Not suitable for Play Store upload. For production distribution you'd need to generate a release keystore and sign with `gradlew assembleRelease`.

13. **`capabilities.push` not registered.** Service worker exists but doesn't yet subscribe to Web Push.

---

## DEPLOYMENT — what's live

| Component | Location | Status |
|---|---|---|
| Production app | https://nm-nexus.ojaskhanna432.workers.dev/ | Live (HTTP 200, loading screen renders) |
| GitHub repo | https://github.com/NightmareCommunity/nm-nexus | Pushed (commit `d82f126`) |
| Supabase DB | `juzmgejicviennjcykxq.supabase.co` | 28 tables, 27 RPCs, RLS on all |
| Storage buckets | `attachments` (private, 25MB), `avatars` (public), `community-icons`, `community-assets`, `voice_messages` (owner-only) | All policies hardened |
| sql-runner Worker | https://nm-nexus-sql-runner.ojaskhanna432.workers.dev | Live (Hyperdrive → Postgres proxy) |
| APK | `/home/z/my-project/download/nm-nexus-v4.1.apk` | 4.48 MB, debug-signed, ready to install |

### Cloudflare env vars set in wrangler.jsonc
- `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_STUN_URLS` (Google STUN)
- `NEXT_PUBLIC_TURN_URLS` / `_USERNAME` / `_CREDENTIAL` (empty — wired but not configured)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

---

## RECOMMENDED NEXT STEPS

1. **Sign in as 3 different accounts** (e.g. on 3 browsers / incognito windows) and verify cross-access is denied:
   - A sends a file to B in DM. B can preview it. C cannot fetch the signed URL even if C knows the storage path.
   - A creates a private community, invites B. B joins. C attempts to call `join_community_via_invite` with the invite code — should fail with "Invalid or unknown invite code" since C doesn't have it.
   - A sends a message in a community channel. B (member) sees it. C (non-member) doesn't even see the channel in the sidebar.

2. **Set up TURN** if you need calls to work across restrictive networks. Free TURN options: OpenRelay (metered.ca), or self-host coturn on a $5 VPS. Put the credentials in `wrangler.jsonc` and redeploy.

3. **Revoke the DB password** (`ojaskhanna432`) and the Cloudflare token (`cfat_...`) once you've confirmed everything works — both are now in your local files but should be rotated for production.

4. **Wire up web push** if you want notifications: implement a Next.js API route that calls Supabase to insert into `web_push_subscriptions`, a service-worker push handler, and a cron (Cloudflare Cron Triggers) that fires notifications.

5. **For Play Store distribution**: generate a release keystore (`keytool -genkey`), configure `android/app/build.gradle` signingConfigs, run `./gradlew assembleRelease`, upload the resulting AAB to Play Console.

---

*Report generated 2026-08-18 by the NM NEXUS build agent.*
