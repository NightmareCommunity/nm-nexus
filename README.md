# NM NEXUS

**Secure realtime communication — by NIGHTMARE STUDIOS.**

NM NEXUS is a WhatsApp + Discord style communication platform with original branding, built on Next.js, Supabase, WebRTC, and client-side end-to-end encryption. This is a real product implementation, not a clone or demo.

---

## What's inside

- **Realtime messaging** — DMs, group chats, replies, reactions, edit/delete, typing indicators, read receipts, presence.
- **End-to-end encryption** — DMs and private groups use X25519 + XChaCha20-Poly1305 via libsodium. Private keys never leave the device.
- **Communities** — Discord-style spaces with text channels, voice channels, roles, and member management. Community channel messages are NOT E2EE (moderation applies).
- **WebRTC calls** — 1:1 voice/video with STUN/TURN fallback. Signaling via Supabase Realtime.
- **File sharing** — encrypted uploads for DMs, plain uploads for community channels. Private Supabase Storage buckets with RLS.
- **PWA** — installable on desktop and mobile, offline shell.
- **Android** — Capacitor wrapper config provided. Build with one command.
- **Premium UI** — dark theme, glass effects, deep purple/lavender/gold palette, smooth motion that respects `prefers-reduced-motion`.

---

## Quick start

### Prerequisites

- Node.js 20+ and Bun (or npm/pnpm)
- A Supabase project (free tier works)
- (Optional) Cloudflare account for deployment
- (Optional) Android Studio for APK builds

### 1. Clone & install

```bash
git clone https://github.com/<your-user>/nm-nexus.git
cd nm-nexus
bun install   # or: npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in your Supabase URL + anon key. All other values are optional for local dev.

### 3. Apply database schema

Open your Supabase project → **SQL Editor** → New query → paste the contents of `supabase/migrations/0001_init.sql` → Run.

This creates all 15 tables, indexes, RLS policies, triggers, storage buckets, and the prekey-bundle RPC.

### 4. Configure auth

In Supabase Dashboard → **Authentication → Providers → Email**:
- For development: **disable email confirmation** so signup is instant.
- For production: enable email confirmation and configure an SMTP provider.

### 5. Run

```bash
bun run dev
```

Open `http://localhost:3000`. Create an account and start chatting.

---

## Architecture

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript 5, Tailwind 4, shadcn/ui, Framer Motion |
| Backend | Supabase Postgres, Supabase Auth, Supabase Realtime, Supabase Storage |
| Crypto | libsodium (X25519, Ed25519, XChaCha20-Poly1305) |
| Calls | WebRTC (browser native), Supabase Realtime for signaling |
| State | Zustand (client), TanStack Query (server, where needed) |
| PWA | manifest.webmanifest, service worker, maskable icons |
| Android | Capacitor 6 |

See [`docs/architecture.md`](docs/architecture.md) for the full system diagram.

---

## Security

- All data access enforced by Postgres RLS — the frontend never bypasses the database security model.
- DM and private group messages are encrypted client-side. The server stores ciphertext only.
- Private encryption keys live in browser `localStorage`, indexed by user ID. They are NEVER sent to the server.
- Community channel messages are NOT E2EE — they are subject to community moderation.
- Storage buckets enforce per-conversation membership for downloads.

See [`docs/security/e2ee.md`](docs/security/e2ee.md) for the full threat model, key generation flow, and recovery limitations.

---

## Deployment

### Cloudflare Pages

```bash
# Set secrets (one-time)
npx wrangler pages secret put NEXT_PUBLIC_SUPABASE_URL --project-name=nm-nexus
npx wrangler pages secret put NEXT_PUBLIC_SUPABASE_ANON_KEY --project-name=nm-nexus

# Build & deploy
bun run build
npx wrangler pages deploy .next/static --project-name=nm-nexus
```

See [`docs/deployment.md`](docs/deployment.md) for full instructions.

### Android APK

```bash
# Install Android dependencies
cd android && bun install && cd ..

# Build web assets
bun run build

# Sync to native project
npx cap sync android

# Build APK (debug)
npx cap build android --keystore-path <path> --keystore-pass <pass> --keystore-alias <alias> --keystore-alias-pass <pass>
```

The APK will be at `android/app/build/outputs/apk/release/app-release.apk`. See [`docs/android.md`](docs/android.md).

---

## Project structure

```
nm-nexus/
├── src/
│   ├── app/                      # Next.js App Router (single / route)
│   │   ├── layout.tsx            # Root layout, dark theme, PWA metadata
│   │   ├── page.tsx              # Mounts <AppShell />
│   │   └── globals.css           # Brand theme (NM NEXUS dark palette)
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components
│   │   └── nexus/                # NM NEXUS app components
│   │       ├── auth/             # Auth screen
│   │       ├── chat/             # ChatPane, NewChatSheet
│   │       ├── calls/            # CallOverlay (WebRTC)
│   │       ├── views/            # Home, DMs, Communities, Contacts, Calls, Settings
│   │       ├── app-shell.tsx     # Top-level shell
│   │       ├── sidebar.tsx       # Desktop nav
│   │       ├── mobile-nav.tsx    # Mobile bottom nav
│   │       ├── main-pane.tsx     # View switcher
│   │       ├── right-panel.tsx   # Details / members / files
│   │       └── command-search.tsx # ⌘K search
│   ├── lib/
│   │   ├── supabase/             # client.ts, server.ts, middleware.ts
│   │   ├── crypto/e2ee.ts        # Full E2EE module
│   │   ├── stores/               # Zustand stores (auth, ui)
│   │   ├── database.types.ts     # Typed schema
│   │   └── utils.ts
│   └── middleware.ts             # Session refresh
├── supabase/migrations/
│   └── 0001_init.sql             # Full schema + RLS + triggers + storage
├── public/                       # PWA manifest, icons, service worker
├── docs/                         # All documentation
├── android/                      # Capacitor wrapper
├── wrangler.toml                 # Cloudflare config
├── capacitor.config.ts           # Android config
├── .env.example                  # Template (no secrets)
└── .gitignore                    # Strong — blocks all credential files
```

---

## Testing

See [`docs/testing.md`](docs/testing.md) (if present) for the manual multi-account test plan. The critical tests:

1. **Account isolation**: User A cannot read User B's DMs, files, or notifications.
2. **Persistence**: A logs out, B logs in, B sees only B's data. A logs back in, A's history is intact.
3. **Encryption**: Wrong recipient cannot decrypt a message.
4. **Storage**: Unauthorized download of an attachment returns 403.
5. **Realtime**: Messages appear instantly on both clients.

---

## Limitations (honest)

- **No Double Ratchet yet** — message keys are derived per-conversation, not per-message. Forward secrecy is partial. Documented in `docs/security/e2ee.md`.
- **No safety-number verification UI** — the `computeSafetyNumber` function exists but is not yet exposed.
- **Group calls** — signaling supports 1:1 cleanly; multi-party calls need an SFU (Selective Forwarding Unit) which is not bundled. Documented.
- **Email confirmation** — Supabase rate-limits signup emails on the free tier. Disable email confirmation for dev, or use SMTP for production.
- **No native push notifications** — PWA push works on Android Chrome but not iOS Safari (Apple limitation). Capacitor wrapper adds native push for the APK.

---

## License & attribution

© NIGHTMARE STUDIOS. All rights reserved. Built on open-source software (Next.js, Supabase, libsodium, shadcn/ui). Cryptographic primitives are audited and standardized — no custom cryptography.

---

## Security disclosure

Found a vulnerability? Email `security@nightmare.studio` (replace with your real address). Do NOT open a public GitHub issue for security bugs.
