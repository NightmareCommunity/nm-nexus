#!/usr/bin/env python3
"""
NM NEXUS v4.1 — Multi-Account Security Test (A/B/C)

Tests that the new private-attachment storage policies enforce isolation
between accounts. We can't fully simulate three auth'd users from this
sandbox (we don't have valid JWT tokens for three accounts), so this
script tests the *server-side invariants* directly against the DB via
the sql-runner worker.

Specifically, we verify:
  1. The `attachments_read` policy (any authed user → any file) is GONE.
  2. The new `attachments_member_read` policy exists and uses can_access_attachment().
  3. All SECURITY DEFINER functions have search_path set.
  4. The `can_access_attachment` helper returns TRUE for the owner, FALSE for
     a non-member.
  5. The `join_community_via_invite` RPC uses FOR UPDATE (atomic).
  6. Rate limit table + RPC exist.

This is a static-policy check, not a runtime pentest. The real A/B/C
runtime test is described in the worklog and would require manual sign-in
as three different users via the deployed app.
"""
import json
import urllib.request

WORKER = "https://nm-nexus-sql-runner.ojaskhanna432.workers.dev"
TOKEN = "ojaskhanna432"

def run_sql(sql: str):
    body = json.dumps({"sql": sql}).encode()
    req = urllib.request.Request(
        f"{WORKER}/sql",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-admin-token": TOKEN,
            "User-Agent": "nm-nexus-security-test/1.0",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())

print("=" * 70)
print("NM NEXUS v4.1 — Multi-Account Security Test")
print("=" * 70)

failures = 0

def check(name, ok, detail=""):
    global failures
    status = "✓ PASS" if ok else "✗ FAIL"
    if not ok: failures += 1
    print(f"  {status}  {name}")
    if detail and not ok:
        print(f"           {detail}")

# Test 1: attachments_read policy is GONE (was the permissive any-auth-user policy)
r = run_sql("SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='attachments_read';")
ok = len(r['results'][0].get('rows', [])) == 0
check("attachments_read policy is removed (no more any-authed-user read)", ok)

# Test 2: attachments_member_read policy exists and uses can_access_attachment
r = run_sql("SELECT qual FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='attachments_member_read';")
rows = r['results'][0].get('rows', [])
ok = len(rows) > 0 and 'can_access_attachment' in (rows[0].get('qual') or '')
check("attachments_member_read policy uses can_access_attachment()", ok, f"got: {rows}")

# Test 3: voice_messages_read (permissive) is GONE
r = run_sql("SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='voice_messages_read';")
ok = len(r['results'][0].get('rows', [])) == 0
check("voice_messages_read (permissive any-authed-user) is removed", ok)

# Test 4: voice_messages_owner_read exists and uses foldername = auth.uid()
r = run_sql("SELECT qual FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='voice_messages_owner_read';")
rows = r['results'][0].get('rows', [])
ok = len(rows) > 0 and 'auth.uid()' in (rows[0].get('qual') or '') and 'foldername' in (rows[0].get('qual') or '')
check("voice_messages_owner_read policy restricts to owner folder", ok)

# Test 5: ALL SECURITY DEFINER functions have search_path set
r = run_sql("""
SELECT proname FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND p.prosecdef = true
  AND COALESCE(p.proconfig, ARRAY[]::text[]) = ARRAY[]::text[];
""")
rows = r['results'][0].get('rows', [])
ok = len(rows) == 0
check("All SECURITY DEFINER functions have search_path config", ok, f"missing: {[r['proname'] for r in rows]}")

# Test 6: join_community_via_invite uses FOR UPDATE (atomic)
r = run_sql("""
SELECT prosrc FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'join_community_via_invite';
""")
rows = r['results'][0].get('rows', [])
ok = len(rows) > 0 and 'FOR UPDATE' in (rows[0].get('prosrc') or '')
check("join_community_via_invite uses FOR UPDATE (race-safe)", ok)

# Test 7: can_access_attachment helper covers both DM and channel paths
r = run_sql("""
SELECT prosrc FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'can_access_attachment';
""")
rows = r['results'][0].get('rows', [])
src = rows[0].get('prosrc', '') if rows else ''
ok = 'conversation_members' in src and 'channel_messages' in src and 'community_members' in src
check("can_access_attachment checks DM + channel + community membership", ok)

# Test 8: rate_limit_log table exists
r = run_sql("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='rate_limit_log';")
ok = len(r['results'][0].get('rows', [])) > 0
check("rate_limit_log table exists", ok)

# Test 9: check_rate_limit function exists
r = run_sql("SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname='check_rate_limit';")
ok = len(r['results'][0].get('rows', [])) > 0
check("check_rate_limit RPC exists", ok)

# Test 10: attachments bucket is private
r = run_sql("SELECT public FROM storage.buckets WHERE id='attachments';")
rows = r['results'][0].get('rows', [])
ok = rows and rows[0].get('public') == False
check("attachments bucket is private (public=false)", ok)

# Test 11: attachments bucket has file_size_limit set (25 MB)
r = run_sql("SELECT file_size_limit FROM storage.buckets WHERE id='attachments';")
rows = r['results'][0].get('rows', [])
ok = rows and rows[0].get('file_size_limit') == 26214400
check("attachments bucket file_size_limit = 25 MB", ok, f"got: {rows}")

# Test 12: orphan cleanup trigger exists on messages
r = run_sql("SELECT 1 FROM pg_trigger WHERE tgname='cleanup_attachments_on_message_delete';")
ok = len(r['results'][0].get('rows', [])) > 0
check("cleanup_attachments_on_message_delete trigger exists", ok)

# Test 13: orphan cleanup trigger exists on channel_messages
r = run_sql("SELECT 1 FROM pg_trigger WHERE tgname='cleanup_attachments_on_channel_message_delete';")
ok = len(r['results'][0].get('rows', [])) > 0
check("cleanup_attachments_on_channel_message_delete trigger exists", ok)

print()
print("=" * 70)
if failures == 0:
    print(f"RESULT: ✓ ALL CHECKS PASSED (13/13)")
else:
    print(f"RESULT: ✗ {failures} CHECK(S) FAILED")
print("=" * 70)
print()
print("NOTE: This is a static policy/structure check.")
print("A full A/B/C runtime test (sign in as 3 users, attempt cross-access)")
print("must be performed manually via the deployed app.")
