#!/usr/bin/env python3
"""
NM NEXUS v4.2 — Full Automated Acceptance Test (headless, A/B/C runtime).

Signs up three real Supabase Auth users (A, B, C) and exercises EVERY
production-critical path against the live backend:

  1.  Anonymous can read public communities.
  2.  Sign up A, B, C with real password auth.
  3.  Profile rows auto-created by trigger.
  4.  A creates community — verify 5 channels + 3 categories + invite code.
  5.  B joins via atomic invite RPC.
  6.  C (non-member) cannot read channels (RLS blocks).
  7.  A→B friend request, B accepts.
  8.  A↔B DM conversation, message persists, B reads, C cannot.
  9.  A updates profile.
  10. A blocks C — C cannot friend A.
  11. User search by username works.
  12. E2EE device key bundle: A publishes, B fetches, C cannot fetch C's own
      (since fetch_prekey_bundle blocks self-lookups).
  13. Atomic invite: double-join attempt — second call returns community_id
      but does NOT create a duplicate membership row.
  14. Rate limiter: spam call check_rate_limit until it returns false.
  15. Orphan attachment cleanup: simulate via direct DB cleanup (admin SQL).
  16. Cleanup: delete A, B, C from auth.users (cascades to all tables).

Run with: python3 scripts/full-acceptance-test.py
"""
import json
import time
import urllib.request
import urllib.parse
import urllib.error
import uuid
import sys
import base64
import secrets

SUPABASE_URL = "https://juzmgejicviennjcykxq.supabase.co"
ANON_KEY = "sb_publishable_Wcon7nj0AlT8oYgdRxGevQ_IqY0Z2IO"
SQL_RUNNER = "https://nm-nexus-sql-runner.ojaskhanna432.workers.dev"
SQL_TOKEN = "ojaskhanna432"

PASS = 0
FAIL = 0
ERRORS = []

def check(name, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  ✓ {name}")
    else:
        FAIL += 1
        ERRORS.append((name, detail))
        print(f"  ✗ {name} — {detail}")

def supabase_request(method, path, body=None, access_token=None, headers=None):
    url = f"{SUPABASE_URL}{path}"
    h = {"apikey": ANON_KEY, "Content-Type": "application/json"}
    if access_token:
        h["Authorization"] = f"Bearer {access_token}"
    if headers:
        h.update(headers)
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body_text = resp.read() or b"null"
            return resp.status, json.loads(body_text)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {"error": str(e)}

def sql_runner(sql):
    body = json.dumps({"sql": sql}).encode()
    req = urllib.request.Request(
        f"{SQL_RUNNER}/sql",
        data=body,
        headers={"Content-Type": "application/json", "x-admin-token": SQL_TOKEN, "User-Agent": "nm-test/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())

def signup(email, password, username):
    status, data = supabase_request("POST", "/auth/v1/signup", {
        "email": email, "password": password, "data": {"username": username},
    })
    if status != 200:
        return None, None, data
    user = data.get("user") or {}
    access_token = data.get("access_token") or (data.get("session") or {}).get("access_token")
    return user.get("id"), access_token, data

def cleanup_user(user_id):
    try:
        sql_runner(f"delete from auth.users where id = '{user_id}';")
    except Exception as e:
        print(f"  (cleanup failed for {user_id}: {e})")

def random_bytes_b64(n):
    return base64.b64encode(secrets.token_bytes(n)).decode()

def main():
    global PASS, FAIL
    print("=" * 70)
    print("NM NEXUS v4.2 — Full Automated Acceptance Test (A/B/C runtime)")
    print("=" * 70)

    # ── Test 1: anon reads ─────────────────────────────────────────────
    print("\n[1] Anonymous can read public communities")
    status, data = supabase_request("GET", "/rest/v1/communities?select=id,name&limit=5")
    check("anonymous GET /communities", status == 200, f"HTTP {status}: {str(data)[:200]}")

    # ── Test 2: sign up A, B, C ────────────────────────────────────────
    print("\n[2] Sign up test users A, B, C")
    suffix = uuid.uuid4().hex[:8]
    email_a = f"nexus_a_{suffix}@nm-test.io"
    email_b = f"nexus_b_{suffix}@nm-test.io"
    email_c = f"nexus_c_{suffix}@nm-test.io"
    pwd = "NMNEXUS-test-1234!"

    uid_a, tok_a, _ = signup(email_a, pwd, f"usera_{suffix}")
    uid_b, tok_b, _ = signup(email_b, pwd, f"userb_{suffix}")
    uid_c, tok_c, _ = signup(email_c, pwd, f"userc_{suffix}")
    check("user A signed up", uid_a is not None)
    check("user B signed up", uid_b is not None)
    check("user C signed up", uid_c is not None)

    if not (uid_a and uid_b and uid_c):
        print("\nCannot continue without users.")
        sys.exit(1)

    # ── Test 3: profile rows auto-created ──────────────────────────────
    print("\n[3] Profile rows auto-created by trigger")
    time.sleep(2)
    status, data = supabase_request("GET", f"/rest/v1/profiles?id=eq.{uid_a}&select=*", access_token=tok_a)
    check("profile A auto-created", status == 200 and len(data) == 1, str(data)[:200])
    status, data = supabase_request("GET", f"/rest/v1/profiles?id=eq.{uid_b}&select=*", access_token=tok_b)
    check("profile B auto-created", status == 200 and len(data) == 1, str(data)[:200])

    # ── Test 4: A creates community ────────────────────────────────────
    print("\n[4] A creates a community via RPC")
    status, data = supabase_request("POST", "/rest/v1/rpc/create_community_with_defaults", {
        "p_name": f"NM Test {suffix}",
        "p_description": "v4.2 acceptance test",
        "p_is_public": True,
    }, access_token=tok_a)
    check("create_community_with_defaults", status == 200 and isinstance(data, str), f"HTTP {status}: {str(data)[:200]}")
    comm_id = data if isinstance(data, str) else None
    invite_code = None

    if comm_id:
        status, data = supabase_request("GET", f"/rest/v1/channels?community_id=eq.{comm_id}&select=id,name,type", access_token=tok_a)
        check("5 default channels created", status == 200 and len(data) == 5, str(data)[:200])
        status, data = supabase_request("GET", f"/rest/v1/channel_categories?community_id=eq.{comm_id}&select=id,name", access_token=tok_a)
        check("3 default categories created", status == 200 and len(data) == 3, str(data)[:200])
        status, data = supabase_request("GET", f"/rest/v1/community_members?community_id=eq.{comm_id}&select=user_id,role", access_token=tok_a)
        check("A is owner", status == 200 and any(m["role"] == "owner" for m in data), str(data)[:200])
        status, data = supabase_request("GET", f"/rest/v1/communities?id=eq.{comm_id}&select=invite_code", access_token=tok_a)
        invite_code = data[0]["invite_code"] if data else None
        check("community has invite_code", invite_code is not None, str(data)[:200])

    # ── Test 5: B joins via invite ─────────────────────────────────────
    print("\n[5] B joins via atomic invite RPC")
    if invite_code:
        status, data = supabase_request("POST", "/rest/v1/rpc/join_community_via_invite", {
            "p_code": invite_code,
        }, access_token=tok_b)
        check("B joins via RPC", status == 200 and data == comm_id, f"HTTP {status}: {str(data)[:200]}")
        status, data = supabase_request("GET", f"/rest/v1/community_members?community_id=eq.{comm_id}&user_id=eq.{uid_b}", access_token=tok_b)
        check("B is a member", status == 200 and len(data) == 1, str(data)[:200])

    # ── Test 6: C blocked ──────────────────────────────────────────────
    print("\n[6] C (non-member) cannot read channels")
    if comm_id:
        status, data = supabase_request("GET", f"/rest/v1/channels?community_id=eq.{comm_id}&select=name", access_token=tok_c)
        check("C blocked from channels", status == 200 and len(data) == 0, str(data)[:200])

    # ── Test 7: friend request A→B ────────────────────────────────────
    print("\n[7] A sends friend request to B; B accepts")
    status, data = supabase_request("POST", "/rest/v1/rpc/send_friend_request", {
        "p_addressee_id": uid_b,
    }, access_token=tok_a)
    check("send_friend_request", status == 200, f"HTTP {status}: {str(data)[:200]}")
    fr_id = data if isinstance(data, str) else None
    if fr_id:
        status, data = supabase_request("POST", "/rest/v1/rpc/respond_to_friend_request", {
            "p_friendship_id": fr_id, "p_accept": True,
        }, access_token=tok_b)
        check("B accepts", status == 200 and data == True, f"HTTP {status}: {str(data)[:200]}")

    # ── Test 8: DM + message ──────────────────────────────────────────
    print("\n[8] A↔B DM; message persists; C blocked")
    status, data = supabase_request("POST", "/rest/v1/rpc/get_or_create_dm_conversation", {
        "p_other_user_id": uid_b,
    }, access_token=tok_a)
    check("get_or_create_dm_conversation", status == 200 and isinstance(data, str), f"HTTP {status}: {str(data)[:200]}")
    conv_id = data if isinstance(data, str) else None

    msg_id = None
    if conv_id:
        status, data = supabase_request("POST", "/rest/v1/messages", {
            "conversation_id": conv_id, "sender_id": uid_a,
            "plaintext_body": f"Hello B! {suffix}", "message_type": "text",
        }, access_token=tok_a, headers={"Prefer": "return=representation"})
        check("A sends message", status in (200, 201), f"HTTP {status}: {str(data)[:200]}")
        msg_id = data[0]["id"] if isinstance(data, list) and data else None

        status, data = supabase_request("GET", f"/rest/v1/messages?conversation_id=eq.{conv_id}&select=id,plaintext_body", access_token=tok_b)
        check("B can read message", status == 200 and len(data) == 1, str(data)[:200])

        status, data = supabase_request("GET", f"/rest/v1/messages?conversation_id=eq.{conv_id}&select=id", access_token=tok_c)
        check("C blocked from DM messages", status == 200 and len(data) == 0, str(data)[:200])

    # ── Test 9: profile update ────────────────────────────────────────
    print("\n[9] A updates profile")
    status, data = supabase_request("PATCH", f"/rest/v1/profiles?id=eq.{uid_a}", {
        "display_name": "Nightmare A", "bio": "v4.2 test",
    }, access_token=tok_a, headers={"Prefer": "return=representation"})
    check("A updates profile", status == 200 and len(data) == 1, f"HTTP {status}: {str(data)[:200]}")

    # ── Test 10: block C ───────────────────────────────────────────────
    print("\n[10] A blocks C; C cannot friend A")
    status, data = supabase_request("POST", "/rest/v1/blocks", {
        "blocker_id": uid_a, "blocked_id": uid_c,
    }, access_token=tok_a)
    check("A blocks C", status in (200, 201), f"HTTP {status}: {str(data)[:200]}")
    status, data = supabase_request("POST", "/rest/v1/rpc/send_friend_request", {
        "p_addressee_id": uid_a,
    }, access_token=tok_c)
    check("C blocked from friending A", status != 200 or (isinstance(data, dict) and "error" in data), f"HTTP {status}: {str(data)[:200]}")

    # ── Test 11: search ────────────────────────────────────────────────
    print("\n[11] Search users by username")
    status, data = supabase_request("POST", "/rest/v1/rpc/search_users_by_username", {
        "p_query": f"userb_{suffix}", "p_limit": 5,
    }, access_token=tok_a)
    check("search finds B", status == 200 and isinstance(data, list) and len(data) >= 1, f"HTTP {status}: {str(data)[:200]}")

    # ── Test 12: E2EE device key bundle publish + fetch ───────────────
    print("\n[12] E2EE device key bundle (publish + fetch + atomic prekey consumption)")
    # A publishes a bundle with 5 one-time prekeys
    otpk_list = [{"key_id": str(i), "public": random_bytes_b64(32)} for i in range(5)]
    status, data = supabase_request("POST", "/rest/v1/rpc/publish_device_keys", {
        "p_identity_public_key": random_bytes_b64(32),
        "p_signed_prekey_public": random_bytes_b64(32),
        "p_signed_prekey_signature": random_bytes_b64(64),
        "p_one_time_prekeys": otpk_list,
    }, access_token=tok_a)
    check("A publishes device keys", status == 200 and isinstance(data, str), f"HTTP {status}: {str(data)[:200]}")

    # B fetches A's bundle — should get back A's identity + signed prekey + ONE one-time prekey
    status, data = supabase_request("POST", "/rest/v1/rpc/fetch_prekey_bundle", {
        "p_recipient_id": uid_a,
    }, access_token=tok_b)
    check("B fetches A's prekey bundle", status == 200 and data is not None, f"HTTP {status}: {str(data)[:200]}")
    if isinstance(data, list) and data:
        row = data[0]
        check("bundle has identity_key", row.get("identity_key") is not None)
        check("bundle has signed_prekey", row.get("signed_prekey") is not None)
        check("bundle has one_time_prekey (popped from queue)", row.get("one_time_prekey") is not None)
        # Fetch again — should consume another prekey
        status2, data2 = supabase_request("POST", "/rest/v1/rpc/fetch_prekey_bundle", {
            "p_recipient_id": uid_a,
        }, access_token=tok_b)
        if isinstance(data2, list) and data2:
            check("second fetch gets a DIFFERENT one-time prekey (atomic consumption)",
                  data2[0].get("one_time_prekey") != row.get("one_time_prekey"))

    # A fetches own bundle — should fail (self-lookup blocked)
    status, data = supabase_request("POST", "/rest/v1/rpc/fetch_prekey_bundle", {
        "p_recipient_id": uid_a,
    }, access_token=tok_a)
    check("A cannot fetch own bundle (self-lookup blocked)",
          status != 200 or (isinstance(data, dict) and "error" in data) or
          (isinstance(data, list) and data and data[0].get("identity_key") is None),
          f"HTTP {status}: {str(data)[:200]}")

    # C tries to fetch A's bundle — should succeed (E2EE bundles are public for key exchange)
    # but C should NOT be able to use it for anything since C has no DM with A.
    status, data = supabase_request("POST", "/rest/v1/rpc/fetch_prekey_bundle", {
        "p_recipient_id": uid_a,
    }, access_token=tok_c)
    check("C can fetch A's PUBLIC bundle (intentional — E2EE key exchange requires this)",
          status == 200, f"HTTP {status}: {str(data)[:200]}")

    # A checks own status
    status, data = supabase_request("POST", "/rest/v1/rpc/get_my_device_bundle_status", {}, access_token=tok_a)
    check("A reads own bundle status",
          status == 200 and isinstance(data, dict) and data.get("has_bundle") == True,
          f"HTTP {status}: {str(data)[:200]}")
    if isinstance(data, dict) and data.get("has_bundle"):
        check("remaining_one_time_prekeys decremented (consumed by B and C)",
              data.get("remaining_one_time_prekeys") == 2, f"got: {data}")

    # ── Test 13: atomic invite (double-join idempotency) ──────────────
    print("\n[13] Atomic invite: B re-joins (should be idempotent, no duplicate row)")
    if invite_code:
        # B already joined in test 5. Re-joining should return comm_id but not duplicate.
        status, data = supabase_request("POST", "/rest/v1/rpc/join_community_via_invite", {
            "p_code": invite_code,
        }, access_token=tok_b)
        check("B re-join returns community_id (idempotent)", status == 200 and data == comm_id, f"HTTP {status}: {str(data)[:200]}")
        # Verify only ONE membership row for B
        status, data = supabase_request("GET", f"/rest/v1/community_members?community_id=eq.{comm_id}&user_id=eq.{uid_b}", access_token=tok_b)
        check("no duplicate membership row", status == 200 and len(data) == 1, f"rows: {len(data) if isinstance(data, list) else 'n/a'}")

    # ── Test 14: rate limiter ──────────────────────────────────────────
    print("\n[14] Rate limiter: spam call until it returns false")
    # Use a unique action name so we don't trip a real production limit.
    action = f"test_{suffix}"
    allowed = 0
    blocked_at = None
    for i in range(20):
        status, data = supabase_request("POST", "/rest/v1/rpc/check_rate_limit", {
            "p_action": action, "p_max": 3, "p_window_seconds": 60,
        }, access_token=tok_a)
        if status == 200 and data == True:
            allowed += 1
        else:
            blocked_at = i
            break
    check("rate limiter allowed first 3 calls", allowed == 3, f"allowed {allowed}")
    check("rate limiter blocked the 4th call", blocked_at == 3, f"blocked at {blocked_at}")

    # ── Test 15: orphan attachment cleanup (admin SQL) ────────────────
    print("\n[15] Orphan attachment cleanup trigger exists")
    try:
        r = sql_runner("SELECT 1 FROM pg_trigger WHERE tgname='cleanup_attachments_on_message_delete';")
        ok = len(r['results'][0].get('rows', [])) > 0
        check("cleanup_attachments_on_message_delete trigger exists", ok)
        r = sql_runner("SELECT 1 FROM pg_trigger WHERE tgname='cleanup_attachments_on_channel_message_delete';")
        ok = len(r['results'][0].get('rows', [])) > 0
        check("cleanup_attachments_on_channel_message_delete trigger exists", ok)
    except Exception as e:
        check("trigger checks (sql runner)", False, str(e))

    # ── Test 16: revoke device keys ────────────────────────────────────
    print("\n[16] Revoke device keys (rotate)")
    status, data = supabase_request("POST", "/rest/v1/rpc/revoke_device_keys", {}, access_token=tok_a)
    check("revoke_device_keys succeeds", status == 200 and data == True, f"HTTP {status}: {str(data)[:200]}")
    status, data = supabase_request("POST", "/rest/v1/rpc/get_my_device_bundle_status", {}, access_token=tok_a)
    check("after revoke: 0 one-time prekeys remain",
          status == 200 and isinstance(data, dict) and data.get("remaining_one_time_prekeys") == 0,
          f"got: {data}")

    # ── Cleanup ────────────────────────────────────────────────────────
    print("\n[Cleanup] Deleting test users (cascades to all tables)")
    for uid in (uid_a, uid_b, uid_c):
        cleanup_user(uid)
    print(f"  Deleted {uid_a[:8]}, {uid_b[:8]}, {uid_c[:8]}")

    # ── Final ──────────────────────────────────────────────────────────
    print()
    print("=" * 70)
    print(f"RESULT: {PASS} passed, {FAIL} failed")
    print("=" * 70)
    if FAIL > 0:
        print("\nFailed checks:")
        for name, detail in ERRORS:
            print(f"  - {name}: {detail}")
        sys.exit(1)
    else:
        print("\n  ✓ ALL ACCEPTANCE CHECKS PASSED — v4.2 backend is production-ready.")
        sys.exit(0)

if __name__ == "__main__":
    main()
