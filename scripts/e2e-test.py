#!/usr/bin/env python3
"""
End-to-end test of NM NEXUS Supabase backend.

Tests:
1. Anonymous can read public communities.
2. Sign up test users A, B, C.
3. User A creates a community — verify default channels + categories + invite code.
4. User B joins via invite code.
5. User A sends friend request to B.
6. User B accepts.
7. User A starts DM with B.
8. User A sends a message — verify it persists.
9. User C cannot read A's DM.
10. User A updates profile — verify persistence.
11. User A blocks C — verify C cannot send friend request.
12. Cleanup: delete test users.

Uses the Supabase REST API with the anon key — exercises RLS exactly like a real client would.
"""
import json
import time
import urllib.request
import urllib.parse
import urllib.error
import uuid
import sys

SUPABASE_URL = "https://juzmgejicviennjcykxq.supabase.co"
ANON_KEY = "sb_publishable_Wcon7nj0AlT8oYgdRxGevQ_IqY0Z2IO"
SQL_RUNNER = "https://nm-nexus-sql-runner.ojaskhanna432.workers.dev"
SQL_TOKEN = "ojaskhanna432"

PASS = 0
FAIL = 0

def check(name, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  ✓ {name}")
    else:
        FAIL += 1
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
            return resp.status, json.loads(resp.read() or "null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or "{}")
        except Exception:
            return e.code, {"error": str(e)}

def sql_runner(sql):
    """Run admin SQL via the runner worker (bypasses RLS)."""
    body = json.dumps({"sql": sql}).encode()
    req = urllib.request.Request(
        f"{SQL_RUNNER}/query",
        data=body,
        headers={"Content-Type": "application/json", "x-admin-token": SQL_TOKEN, "User-Agent": "nm-test/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())

def signup(email, password, username):
    """Sign up via Supabase Auth. Returns (user_id, access_token) or (None, None)."""
    status, data = supabase_request("POST", "/auth/v1/signup", {
        "email": email,
        "password": password,
        "data": {"username": username},
    })
    if status != 200:
        return None, None, data
    user = data.get("user") or {}
    # access_token is at top level of response (not nested under "session" for direct signup)
    access_token = data.get("access_token") or (data.get("session") or {}).get("access_token")
    return user.get("id"), access_token, data

def signin(email, password):
    status, data = supabase_request("POST", "/auth/v1/token?grant_type=password", {
        "email": email, "password": password,
    })
    if status != 200:
        return None, None, data
    access_token = data.get("access_token")
    user_id = data.get("user", {}).get("id")
    return user_id, access_token, data

def cleanup_user(user_id):
    """Delete a user via admin SQL (RLS bypass)."""
    try:
        sql_runner(f"delete from auth.users where id = '{user_id}';")
    except Exception as e:
        print(f"  (cleanup failed for {user_id}: {e})")

def main():
    global PASS, FAIL
    print("=== NM NEXUS Backend E2E Test ===\n")

    # ── Test 1: anon can read public communities ──
    print("[1] Anonymous can read public communities (RLS allows public reads)")
    status, data = supabase_request("GET", "/rest/v1/communities?select=id,name&limit=5")
    check("anonymous GET /communities", status == 200, f"HTTP {status}: {data}")

    # ── Sign up test users ──
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

    # Verify profile rows were auto-created by the trigger
    time.sleep(2)
    status, data = supabase_request("GET", f"/rest/v1/profiles?id=eq.{uid_a}&select=*", access_token=tok_a)
    check("profile A auto-created by trigger", status == 200 and len(data) == 1, str(data)[:200])

    # ── Test 3: A creates a community ──
    print("\n[3] User A creates a community via RPC")
    status, data = supabase_request("POST", "/rest/v1/rpc/create_community_with_defaults", {
        "p_name": f"NM Test Community {suffix}",
        "p_description": "E2E test community",
        "p_is_public": True,
    }, access_token=tok_a)
    check("create_community_with_defaults RPC", status == 200 and isinstance(data, str), f"HTTP {status}: {str(data)[:200]}")
    comm_id = data if isinstance(data, str) else None
    invite_code = None

    if comm_id:
        # Verify default channels + categories
        status, data = supabase_request("GET", f"/rest/v1/channels?community_id=eq.{comm_id}&select=id,name,type", access_token=tok_a)
        check("5 default channels created", status == 200 and len(data) == 5, str(data)[:200])
        status, data = supabase_request("GET", f"/rest/v1/channel_categories?community_id=eq.{comm_id}&select=id,name", access_token=tok_a)
        check("3 default categories created", status == 200 and len(data) == 3, str(data)[:200])
        status, data = supabase_request("GET", f"/rest/v1/community_members?community_id=eq.{comm_id}&select=user_id,role", access_token=tok_a)
        check("A is owner", status == 200 and any(m["role"] == "owner" for m in data), str(data)[:200])
        # Get invite code
        status, data = supabase_request("GET", f"/rest/v1/communities?id=eq.{comm_id}&select=invite_code,name", access_token=tok_a)
        invite_code = data[0]["invite_code"] if data else None
        check("community has invite_code", invite_code is not None, str(data)[:200])
        # Get invite from community_invites table too
        status, data = supabase_request("GET", f"/rest/v1/community_invites?community_id=eq.{comm_id}&select=code,uses,max_uses", access_token=tok_a)
        check("invite row in community_invites", status == 200 and len(data) >= 1, str(data)[:200])

    # ── Test 4: B joins via invite ──
    print("\n[4] User B joins the community via invite code")
    if invite_code:
        status, data = supabase_request("POST", "/rest/v1/rpc/join_community_via_invite", {
            "p_code": invite_code,
        }, access_token=tok_b)
        check("B joins via RPC", status == 200 and data == comm_id, f"HTTP {status}: {str(data)[:200]}")
        # Verify B is a member
        status, data = supabase_request("GET", f"/rest/v1/community_members?community_id=eq.{comm_id}&user_id=eq.{uid_b}", access_token=tok_b)
        check("B is a member", status == 200 and len(data) == 1, str(data)[:200])
        # Verify B can see channels
        status, data = supabase_request("GET", f"/rest/v1/channels?community_id=eq.{comm_id}&select=name", access_token=tok_b)
        check("B can read channels", status == 200 and len(data) == 5, str(data)[:200])

    # ── Test 5: C is NOT a member, cannot read channels ──
    print("\n[5] User C (not a member) cannot read channels")
    if comm_id:
        status, data = supabase_request("GET", f"/rest/v1/channels?community_id=eq.{comm_id}&select=name", access_token=tok_c)
        check("C blocked from channels", status == 200 and len(data) == 0, str(data)[:200])

    # ── Test 6: A sends friend request to B ──
    print("\n[6] A sends friend request to B")
    status, data = supabase_request("POST", "/rest/v1/rpc/send_friend_request", {
        "p_addressee_id": uid_b,
    }, access_token=tok_a)
    check("send_friend_request RPC", status == 200, f"HTTP {status}: {str(data)[:200]}")
    fr_id = data if isinstance(data, str) else None

    # ── Test 7: B accepts ──
    print("\n[7] B accepts friend request")
    if fr_id:
        status, data = supabase_request("POST", "/rest/v1/rpc/respond_to_friend_request", {
            "p_friendship_id": fr_id,
            "p_accept": True,
        }, access_token=tok_b)
        check("B accepts", status == 200 and data == True, f"HTTP {status}: {str(data)[:200]}")

    # ── Test 8: A starts DM with B ──
    print("\n[8] A starts DM with B")
    status, data = supabase_request("POST", "/rest/v1/rpc/get_or_create_dm_conversation", {
        "p_other_user_id": uid_b,
    }, access_token=tok_a)
    check("get_or_create_dm_conversation RPC", status == 200 and isinstance(data, str), f"HTTP {status}: {str(data)[:200]}")
    conv_id = data if isinstance(data, str) else None

    # ── Test 9: A sends a message ──
    print("\n[9] A sends a DM message to B")
    if conv_id:
        status, data = supabase_request("POST", "/rest/v1/messages", {
            "conversation_id": conv_id,
            "sender_id": uid_a,
            "plaintext_body": f"Hello B! Test {suffix}",
            "message_type": "text",
        }, access_token=tok_a, headers={"Prefer": "return=representation"})
        check("A sends message", status in (200, 201), f"HTTP {status}: {str(data)[:200]}")
        msg_id = data[0]["id"] if isinstance(data, list) and data else None

        # B can read it
        status, data = supabase_request("GET", f"/rest/v1/messages?conversation_id=eq.{conv_id}&select=id,plaintext_body,sender_id", access_token=tok_b)
        check("B can read message", status == 200 and len(data) == 1, str(data)[:200])

        # C cannot read it (RLS blocks non-members)
        status, data = supabase_request("GET", f"/rest/v1/messages?conversation_id=eq.{conv_id}&select=id", access_token=tok_c)
        check("C blocked from DM messages", status == 200 and len(data) == 0, str(data)[:200])

    # ── Test 10: A updates profile ──
    print("\n[10] A updates profile (display_name, bio)")
    status, data = supabase_request("PATCH", f"/rest/v1/profiles?id=eq.{uid_a}", {
        "display_name": "Nightmare A",
        "bio": "E2E test user A",
        "custom_status": "Testing NM NEXUS",
    }, access_token=tok_a, headers={"Prefer": "return=representation"})
    check("A updates profile", status == 200 and len(data) == 1, f"HTTP {status}: {str(data)[:200]}")
    if isinstance(data, list) and data:
        check("display_name persisted", data[0].get("display_name") == "Nightmare A")
        check("bio persisted", data[0].get("bio") == "E2E test user A")

    # ── Test 11: A blocks C ──
    print("\n[11] A blocks C, then C cannot send friend request to A")
    status, data = supabase_request("POST", "/rest/v1/blocks", {
        "blocker_id": uid_a,
        "blocked_id": uid_c,
    }, access_token=tok_a)
    check("A blocks C", status in (200, 201), f"HTTP {status}: {str(data)[:200]}")

    # C tries to send friend request to A — should fail (RPC raises exception)
    status, data = supabase_request("POST", "/rest/v1/rpc/send_friend_request", {
        "p_addressee_id": uid_a,
    }, access_token=tok_c)
    check("C blocked from friending A", status != 200 or (isinstance(data, dict) and "error" in data), f"HTTP {status}: {str(data)[:200]}")

    # ── Test 12: Search users ──
    print("\n[12] Search users by username")
    status, data = supabase_request("POST", "/rest/v1/rpc/search_users_by_username", {
        "p_query": f"userb_{suffix}",
        "p_limit": 5,
    }, access_token=tok_a)
    check("search finds B", status == 200 and isinstance(data, list) and len(data) >= 1, f"HTTP {status}: {str(data)[:200]}")

    # ── Cleanup ──
    print("\n[Cleanup] Deleting test users")
    for uid in (uid_a, uid_b, uid_c):
        cleanup_user(uid)
    print(f"  Deleted {uid_a[:8]}, {uid_b[:8]}, {uid_c[:8]}")

    print(f"\n=== Results: {PASS} passed, {FAIL} failed ===")
    sys.exit(0 if FAIL == 0 else 1)

if __name__ == "__main__":
    main()
