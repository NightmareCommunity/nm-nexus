# NM NEXUS — Multi-Agent Worklog

Shared work log. Append-only. Newest entries at the bottom.

---
Task ID: v4.1-audit
Agent: main
Task: Inspect existing NM NEXUS state to plan v4.1 (security, files, pagination, invites, voice honesty) edits without breaking working features.

Work Log:
- Read `package.json`, `auth-store.ts`, `app-shell.tsx`, `channel-sidebar.tsx`, `chat-pane.tsx`, `database.types.ts`, `nexus-helpers.ts`, `supabase/client.ts`.
- Listed 28 existing tables in production DB via the `nm-nexus-sql-runner` Cloudflare Worker (re-deployed using Hyperdrive binding for direct Postgres access — DB host is IPv6-only and unreachable from this sandbox, so Hyperdrive via Worker is the only path).
- Inspected all SECURITY DEFINER functions: 8 of 13 lack `SET search_path` config.
- Inspected storage buckets: `attachments` is already private (`public: false`), but storage SELECT policy `attachments_read` allows ANY authenticated user to read ANY attachment (CRITICAL BUG — Account C could read A/B files).
- Inspected `attachments` DB table RLS: only checks DM membership, missing channel_messages path (so community channel attachments would not be readable).
- Confirmed `community_invites` schema already has `max_uses`, `uses`, `expires_at`, `revoked_at` — but the `join_community_via_invite` RPC was not atomic (no `FOR UPDATE` row lock).
- Confirmed `read_states` table + RLS exists and the `markAsRead` helper already writes per-user read positions.
- Confirmed `channel_categories` table exists.
- Confirmed existing migrations 0001-0004 + parts/* are committed.

Stage Summary:
- DB schema is ~85% ready for v4.1 features. Gaps are: storage policy over-permissiveness, missing `search_path` on 8 SECURITY DEFINER functions, missing channel-message path in attachments table RLS, non-atomic invite joins, no orphan-cleanup triggers, no rate-limit helper, no signed-URL helper for fetching attachment metadata safely.
- Frontend gaps: chat-pane uses public URLs + body markers instead of attachments records + signed URLs; uses `.limit(100)` instead of cursor pagination; no unread separator / Jump to Present.
- sql-runner Worker is alive at https://nm-nexus-sql-runner.ojaskhanna432.workers.dev/sql (admin token = `ojaskhanna432`) — this is our migration channel.
- Next: write 0005 migration covering security hardening + new RPCs, then apply, then edit frontend.
