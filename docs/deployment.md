# NM NEXUS — Deployment

## Overview

NM NEXUS deploys as a static Next.js app to Cloudflare Pages, with Supabase as the managed backend. No long-running server is required — all realtime happens via Supabase Realtime (WebSocket) from the browser.

## Prerequisites

- Supabase project (free or Pro tier)
- Cloudflare account (free tier works)
- Domain (optional — `*.pages.dev` works fine)
- Node.js 20+ and Bun

## Step 1 — Apply database schema

1. Open your Supabase project → **SQL Editor** → New query.
2. Paste the entire contents of `supabase/migrations/0001_init.sql`.
3. Click **Run**.
4. Verify by running:
   ```sql
   select tablename from pg_tables where schemaname='public' order by tablename;
   ```
   You should see all 15 tables plus `migrations`, `schema_migrations` (Supabase internal).

## Step 2 — Configure auth

In Supabase Dashboard → **Authentication → Providers → Email**:

**For development:**
- Disable "Confirm email" so signup is instant.
- Set a high rate limit if testing heavily.

**For production:**
- Enable "Confirm email".
- Configure SMTP (recommended: Resend, Postmark, or Amazon SES).
- Set the site URL to your Cloudflare Pages domain.
- Add redirect URLs: `https://<your-domain>/**`.

## Step 3 — Configure storage

The migration creates the storage buckets (`avatars`, `attachments`, `community_assets`) and their RLS policies automatically. Verify in **Storage** tab.

For production:
- Consider adding a Cloudflare Image Resizing or Cloudflare R2 front-end for large files.
- Set up a CDN cache rule for `avatars/` (public bucket).

## Step 4 — Local environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_STUN_URLS=stun:stun.l.google.com:19302

# Optional for production calls over restrictive NATs:
# NEXT_PUBLIC_TURN_URLS=turn:your-turn-server.example.com:3478
# NEXT_PUBLIC_TURN_USERNAME=<username>
# NEXT_PUBLIC_TURN_CREDENTIAL=<credential>
```

Get the URL and anon key from Supabase Dashboard → **Project Settings → API**.

**Important:** never put the service-role key in `NEXT_PUBLIC_*` variables. The service-role key bypasses RLS and must only be used server-side (which this app does not currently require).

## Step 5 — Build

```bash
bun install
bun run build
```

The build outputs to `.next/` (standard Next.js) and the static export is prepared for Cloudflare Pages.

## Step 6 — Deploy to Cloudflare Pages

### Option A: Git integration (recommended)

1. Push your repo to GitHub.
2. Cloudflare Dashboard → **Pages → Create project → Connect to Git**.
3. Select your `nm-nexus` repo.
4. Framework preset: **Next.js**.
5. Build command: `bun run build`.
6. Build output directory: `.next/static` (or as configured in `wrangler.toml`).
7. Environment variables (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_STUN_URLS`
   - `NEXT_PUBLIC_APP_URL` (your `*.pages.dev` or custom domain)
8. Save and Deploy.

Every push to `main` triggers a production deploy. PRs get preview deploys.

### Option B: Wrangler CLI

```bash
# Install wrangler
bun add -g wrangler

# Login
npx wrangler login

# Create the project (one-time)
npx wrangler pages project create nm-nexus

# Set secrets (one-time per secret)
npx wrangler pages secret put NEXT_PUBLIC_SUPABASE_URL --project-name=nm-nexus
npx wrangler pages secret put NEXT_PUBLIC_SUPABASE_ANON_KEY --project-name=nm-nexus

# Build & deploy
bun run build
npx wrangler pages deploy .next/static --project-name=nm-nexus
```

## Step 7 — Verify deployment

Once deployed, verify:

1. **HTTPS** — Cloudflare enforces this by default. Check the certificate is valid.
2. **Routing** — open `https://<your-domain>/`. Should show the auth screen.
3. **Auth** — sign up a test account. Should land on the home screen.
4. **Realtime** — open two browser windows, send a DM. Message should appear instantly in the other.
5. **Storage** — upload an avatar. Should appear in the profile.
6. **Supabase connection** — check the browser console for any RLS errors.

## Step 8 — Custom domain (optional)

In Cloudflare Pages → **Custom domains → Set up a custom domain**.

If the domain is on Cloudflare DNS, it auto-configures. Otherwise, add a CNAME record pointing to `<your-project>.pages.dev`.

Update `NEXT_PUBLIC_APP_URL` and Supabase Auth redirect URLs to the custom domain.

## Environment variables reference

| Variable | Where to set | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Cloudflare Pages env vars | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cloudflare Pages env vars | Yes |
| `NEXT_PUBLIC_STUN_URLS` | Cloudflare Pages env vars | Yes |
| `NEXT_PUBLIC_TURN_URLS` | Cloudflare Pages env vars | For calls over restrictive NATs |
| `NEXT_PUBLIC_TURN_USERNAME` | Cloudflare Pages env vars | With TURN |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | Cloudflare Pages env vars | With TURN |
| `NEXT_PUBLIC_APP_NAME` | `wrangler.toml` `[vars]` | Defaults to "NM NEXUS" |
| `NEXT_PUBLIC_APP_URL` | Cloudflare Pages env vars | For correct redirects |

**Never set:**
- `SUPABASE_SERVICE_ROLE_KEY` (not used by this frontend)
- `SUPABASE_DB_URL` (only for migration scripts, never in the deployed app)

## TURN server setup (optional, for calls)

For development, STUN-only works fine on most networks.

For production, you need TURN if your users are behind corporate firewalls or carrier-grade NAT. Options:

- **Metered TURN** (free tier, easy): https://www.metered.ca/tools/openrelay/
- **Self-hosted coturn**: https://github.com/coturn/coturn
- **Twilio Network Traversal Service** (paid, enterprise-grade)

Never commit TURN credentials to Git. Set them as Cloudflare secrets.

## Monitoring

- **Cloudflare Analytics**: traffic, cache hit rate, errors
- **Supabase Dashboard**: database health, auth logs, storage usage, realtime connections
- **Browser console**: client-side errors
- **Sentry** (optional): add `@sentry/nextjs` for production error tracking

## Rollback

Cloudflare Pages keeps every deployment. To rollback:
1. Cloudflare Dashboard → **Pages → nm-nexus → Deployments**
2. Find the last known-good deployment
3. Click **… → Rollback to this deployment**

Database rollbacks require Supabase PITR (Pro tier) or a manual `pg_dump` restore.

## Cost optimization (free tier)

- **Supabase free tier**: 500MB DB, 1GB storage, 2GB egress, 50K MAU — fine for ~1000 users
- **Cloudflare Pages free tier**: unlimited bandwidth, 500 builds/month
- **STUN is free** (Google's public STUN)
- **TURN is the cost driver** — only needed for ~10-20% of calls over restrictive NATs

Estimated monthly cost for 1000 active users: **$0** on free tiers, **$25-50** with Supabase Pro + a small TURN server.

## Security checklist before production launch

- [ ] Rotate all credentials used during development
- [ ] Set strong Supabase project password
- [ ] Enable email confirmation in Supabase Auth
- [ ] Configure SMTP for transactional emails
- [ ] Review all RLS policies with `select * from pg_policies`
- [ ] Test with at least 3 accounts (Account A, B, C) — A cannot read B's data
- [ ] Run a secret-scan on the repo (`scripts/scan-secrets.sh`)
- [ ] Verify `.env*` is in `.gitignore`
- [ ] Verify no secrets in Cloudflare deployment logs
- [ ] Set up Sentry or equivalent for error monitoring
- [ ] Configure Cloudflare WAF rules (rate limit on auth endpoints)
- [ ] Set up Cloudflare Access for admin URLs (if any)
- [ ] Document your incident response plan
