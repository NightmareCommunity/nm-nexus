# NM NEXUS — GitHub Push Instructions

The repo is initialized locally with a clean `.gitignore` and has been secret-scanned. Follow these steps to push to your GitHub.

## 1. Create the GitHub repository

```bash
# Via GitHub CLI (if installed):
gh repo create nm-nexus --private --source=. --remote=origin

# Or via the GitHub web UI:
# 1. Go to https://github.com/new
# 2. Repository name: nm-nexus
# 3. Visibility: Private (recommended for now)
# 4. Do NOT initialize with README (we already have one)
# 5. Click "Create repository"
# 6. Copy the URL: https://github.com/<your-username>/nm-nexus.git
```

## 2. Add the remote (if you used the web UI)

```bash
git remote add origin https://github.com/<your-username>/nm-nexus.git
```

## 3. Verify no secrets are staged

```bash
bash scripts/scan-secrets.sh
```

Must output: `✅ No secrets detected. Safe to push.`

## 4. Commit and push

```bash
git add -A
git commit -m "feat: initial NM NEXUS build — secure realtime communication platform

- Next.js 16 + Supabase + WebRTC + libsodium E2EE
- 15-table schema with full RLS policies
- DMs, group chats, communities, channels, calls
- PWA-ready with offline shell
- Capacitor 6 config for Android APK
- Cloudflare Pages deployment config
- Full documentation: architecture, E2EE, database, deployment, android"

git branch -M main
git push -u origin main
```

## 5. Verify on GitHub

1. Open `https://github.com/<your-username>/nm-nexus`
2. Check that the file tree looks right
3. Open `README.md` — should render
4. Open `.env.example` — should contain placeholders only, no real values
5. Search the repo for any of these strings — should return ZERO matches:
   - your Postgres password
   - your Supabase anon key (even though it's safe to expose, you should rotate it)
   - your Cloudflare token
   - your Cloudflare account ID
   - your R2 access key ID
   - your R2 secret access key

## 6. Post-push checklist

After pushing, you should also:

### Rotate credentials (do this now)

1. **Supabase**: Dashboard → Project Settings → API → "Rotate anon key"
2. **Cloudflare API Token**: Dashboard → My Profile → API Tokens → delete `NM_NEXUS` token, create new one
3. **R2 credentials**: Dashboard → R2 → Manage R2 API Tokens → delete + recreate
4. **Postgres password**: Supabase → Project Settings → Database → "Reset database password"
5. **GitHub PAT**: GitHub → Settings → Developer settings → Personal access tokens → delete the one you used

Update your local `.env.local` with the new Supabase anon key. Everything else stays the same.

### Connect Cloudflare Pages to GitHub

1. Cloudflare Dashboard → Pages → Create project → Connect to Git
2. Select your `nm-nexus` repo
3. Framework preset: Next.js
4. Build command: `bun run build`
5. Build output: `.next/static`
6. Environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (use the rotated one)
   - `NEXT_PUBLIC_STUN_URLS`
7. Save and Deploy

Every future `git push origin main` triggers an automatic deploy.

### Optional: Set up branch protection

```bash
gh api repos/<your-username>/nm-nexus/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -X PUT \
  -f required_status_checks='{"strict":true,"contexts":[]}' \
  -f enforce_admins=false \
  -f required_pull_request_reviews=null \
  -f restrictions=null
```

## 7. Multi-account testing (after deploy)

Once deployed, create 3 test accounts and verify:

1. **Account A** signs up, sends a DM to **Account B**
2. **Account B** logs in, sees the DM, replies
3. **Account A** sends an encrypted file
4. **Account B** downloads + decrypts it
5. **Account A** and **B** make a voice call
6. **Account C** logs in — must NOT see A↔B conversation, files, or notifications
7. **Account A** logs out, **B** logs in on the same device — **B** sees only **B**'s data
8. **Account A** logs back in — **A**'s history is intact

If any of these fail, **do not declare the build complete**. File an issue and investigate the root cause.
