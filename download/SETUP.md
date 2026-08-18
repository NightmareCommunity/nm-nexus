# NM NEXUS — Production Setup Runbook

This file tells you exactly what to do to make your live NM NEXUS app fully functional.
The app is **already deployed** at `https://nm-nexus.ojaskhanna432.workers.dev` and the
database schema is **already applied** to your Supabase project. You only need to do the
few steps below to enable storage buckets (for avatar/file uploads) and verify Google OAuth.

---

## ✅ What's already done

- ✅ Next.js 16 app built and deployed to Cloudflare Workers
- ✅ All 20 database tables created in Supabase (profiles, conversations, messages, channels, communities, etc.)
- ✅ All RLS policies applied — users can only read/write their own data
- ✅ Triggers for auto-creating profile rows on signup
- ✅ Realtime enabled on messages, channel_messages, conversations, channels
- ✅ Service Worker v2 (invalidates stuck v1 cache from prior deploy)
- ✅ Init flow hardened — 8s timeout + retry button, NEVER infinite spinner
- ✅ Supabase env vars baked into client bundle
- ✅ Android APK built (4.3 MB) pointing at live URL
- ✅ Code pushed to GitHub at NightmareCommunity/nm-nexus

---

## 🔧 What you need to do (5 minutes)

### 1. Create Storage Buckets in Supabase (REQUIRED for avatar & file uploads)

The anon key can't create buckets — you have to do this in the dashboard.

1. Open: https://supabase.com/dashboard/project/juzmgejicviennjcykxq/sql/new
2. Click **"New query"**
3. Paste the entire contents of `download/nm-nexus-storage.sql`
4. Click **Run**
5. You should see "Success. No rows returned."
6. Verify by running: `select id, name, public from storage.buckets;`
   — you should see 3 buckets: `avatars`, `attachments`, `community-icons`

### 2. Verify Google OAuth redirect URIs (REQUIRED for Google sign-in)

1. Open: https://console.cloud.google.com/apis/credentials
2. Find your OAuth 2.0 Client ID (the one ending in `.apps.googleusercontent.com`)
3. Click it to edit
4. Under **Authorized redirect URIs**, make sure these are listed:
   ```
   https://juzmgejicviennjcykxq.supabase.co/auth/v1/callback
   ```
   (If you also want local dev: `http://localhost:3000/auth/callback`)
5. Under **Authorized JavaScript origins**, add:
   ```
   https://nm-nexus.ojaskhanna432.workers.dev
   https://juzmgejicviennjcykxq.supabase.co
   ```
6. Save

### 3. Verify Google OAuth is enabled in Supabase

1. Open: https://supabase.com/dashboard/project/juzmgejicviennjcykxq/auth/providers
2. Find **Google**
3. Make sure it's **Enabled**
4. Client ID: your Google OAuth Client ID (from Google Cloud Console)
5. Client Secret: your Google OAuth Client Secret (from Google Cloud Console)
6. Save

(These are already set from prior session — just verify they're still there)

---

## 📱 Install the APK

1. The APK is at `download/nm-nexus-v2.0.apk` (4.3 MB)
2. Transfer it to your Android phone (USB, Drive, etc.)
3. On your phone: tap the APK, allow "Install from unknown sources" if prompted
4. Open **NM NEXUS** from your app drawer
5. Sign up with Google or email

The APK is a WebView shell — it always loads the live site, so updates are
automatic. No need to rebuild the APK for app updates.

---

## 🧪 Multi-account testing

After setup, create 3 test accounts and verify:

1. **Account A** signs up with Google, sets username
2. **Account A** signs out, **Account B** signs up with email
3. **Account A** signs back in, searches for **B** in `⌘K` or Friends → Add Friend
4. **Account B** accepts the friend request
5. **Account A** starts a DM with **B** — message appears instantly via Realtime
6. **Account B** replies — **A** sees it instantly
7. **Account A** uploads an image in the DM — **B** sees it inline
8. **Account A** creates a community, **B** joins via invite code
9. Both send messages in `#general` channel — works in realtime
10. **Account A** starts a voice call from the DM header — WebRTC connects

If any of these fail, check:
- Browser dev console for errors
- Supabase Dashboard → Logs for database errors
- Cloudflare Workers → Logs for server errors

---

## 🚀 Production URLs

| What | URL |
|---|---|
| Live app | https://nm-nexus.ojaskhanna432.workers.dev |
| GitHub repo | https://github.com/NightmareCommunity/nm-nexus |
| Supabase dashboard | https://supabase.com/dashboard/project/juzmgejicviennjcykxq |
| Cloudflare worker | https://dash.cloudflare.com/9dba4b2bcc1c44e30c76b6d50e9ad8c6/workers/services/nm-nexus |
| Google OAuth console | https://console.cloud.google.com/apis/credentials |

---

## 🔒 Security checklist

- [x] RLS on every table — users can only read/write their own data
- [x] Storage buckets scoped to user folders (`auth.uid()::text`)
- [x] Anon key only — service role key never exposed to browser
- [x] PKCE flow for OAuth (no implicit grant)
- [x] HTTPS only — Cloudflare auto-redirects HTTP
- [x] No secrets in git history (scanned)
- [x] Service Worker never caches Supabase requests
- [x] Init timeout prevents infinite loading on network failure

---

## 🛠 Local development

```bash
# Install deps
bun install

# Run dev server
bun run dev

# Build for Cloudflare
bun run build:cf

# Deploy to Cloudflare
bun run deploy:cf

# Rebuild APK (after icon/logo changes)
bun run build:android
# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

`.env.local` is required for local dev — copy `.env.example` to `.env.local` and fill in real values.

---

## 📂 File structure (key files)

```
src/
  app/
    page.tsx                    — Root page (renders AppShell)
    layout.tsx                  — Root layout (fonts, metadata, SW register)
    auth/callback/route.ts      — OAuth PKCE callback handler
  components/
    nexus/
      app-shell.tsx             — Top-level shell: auth gate, layout switcher
      auth/auth-screen.tsx      — Sign in / sign up screen with Google OAuth
      navigation-rail.tsx       — Left icon rail (Home, DMs, Friends, Communities, Calls)
      channel-sidebar.tsx       — Channel list (Text Channels / Voice Channels sections) + Create dialog
      main-pane.tsx             — Routes active view to the right component
      mobile-nav.tsx            — Bottom tab bar (mobile only)
      member-panel.tsx          — Right panel: community members grouped by role/online
      command-search.tsx        — ⌘K global search (users + communities)
      chat/
        chat-pane.tsx           — Chat UI: messages, composer, attachments, reactions, replies
      calls/
        call-overlay.tsx        — Fullscreen WebRTC voice/video UI
      profile/
        profile-card-modal.tsx  — Click-to-open user profile card
      views/
        home-view.tsx           — Home dashboard
        friends-view.tsx        — Friends list (online/all/pending/blocked/add)
        communities-view.tsx    — Server browser + create/join dialogs
        calls-view.tsx          — Call history
        settings-view.tsx       — User settings (account/profile/privacy/etc.)
  lib/
    stores/
      auth-store.ts             — Zustand auth: init, signIn, signUp, signOut, profile
      ui-store.ts               — Zustand UI: activeView, activeChannel, callOverlay, etc.
    supabase/
      client.ts                 — Browser Supabase client (cached, 15s timeout)
      server.ts                 — Server-side Supabase client
      middleware.ts             — Refresh auth session on navigation
    database.types.ts           — TypeScript types matching the SQL schema

supabase/migrations/
  0001_init.sql                 — Full schema (20 tables + RLS + triggers) — ALREADY APPLIED
  0002_storage_buckets.sql      — Storage buckets + policies — YOU NEED TO RUN THIS

public/
  sw.js                         — Service Worker v2 (cache shell, never cache Supabase)
  manifest.webmanifest          — PWA manifest
  logo.png                      — Brand logo (1024x1024)

download/
  nm-nexus-v2.0.apk             — Android APK (4.3 MB)
  nm-nexus-schema.sql           — Copy of 0001_init.sql (already applied)
  nm-nexus-storage.sql          — Copy of 0002_storage_buckets.sql (run this)
```

---

## 🆘 Troubleshooting

**"Establishing secure channel…" never resolves**
- Hard-refresh the page (Ctrl+Shift+R) to bypass the old v1 service worker cache
- Check browser dev console for errors
- Verify your internet can reach `juzmgejicviennjcykxq.supabase.co`

**Google sign-in redirects but shows "redirect_uri_mismatch"**
- Re-check step 2 above — the redirect URI must be EXACTLY `https://juzmgejicviennjcykxq.supabase.co/auth/v1/callback`

**Avatar upload fails with "Bucket not found"**
- You haven't run `nm-nexus-storage.sql` yet — see step 1

**Messages don't appear in realtime**
- Check Supabase Dashboard → Realtime → make sure `messages`, `channel_messages` are listed
- Check browser dev console for WebSocket errors

**APK shows white screen**
- Make sure your phone has internet
- The APK loads `https://nm-nexus.ojaskhanna432.workers.dev` — verify it loads in mobile Chrome first

---

Built by **NIGHTMARE STUDIOS** · v2.0 · 2026
