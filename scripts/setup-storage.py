#!/usr/bin/env python3
"""
Set up Supabase Storage buckets via the REST API.

The anon/publishable key can list buckets but cannot create them.
We need to either:
1. Use the service role key (we don't have one), OR
2. Run SQL via the database connection (we'll try pooler), OR
3. Ask the user to create buckets via the Supabase Dashboard

Storage buckets 'avatars' and 'attachments' need to be created.
This script tries multiple methods.
"""
import sys
import os
import json
import urllib.request
import urllib.error

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://YOUR-PROJECT.supabase.co")
ANON_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key")

def try_create_bucket(name):
    """Try to create a bucket via the Storage API using anon key (will likely fail)."""
    url = f"{SUPABASE_URL}/storage/v1/bucket"
    data = json.dumps({
        "id": name,
        "name": name,
        "public": True,
    }).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {ANON_KEY}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req) as r:
            print(f"  ✓ {name}: created ({r.status})")
            return True
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200]
        print(f"  ✗ {name}: HTTP {e.code} — {body}")
        return False
    except Exception as e:
        print(f"  ✗ {name}: {e}")
        return False

def main():
    print("→ Checking existing buckets…")
    req = urllib.request.Request(
        f"{SUPABASE_URL}/storage/v1/bucket",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            buckets = json.load(r)
            print(f"  Existing buckets: {[b['id'] for b in buckets]}")
    except Exception as e:
        print(f"  Failed to list: {e}")
        buckets = []

    needed = ["avatars", "attachments"]
    for b in needed:
        if not any(x["id"] == b for x in buckets):
            print(f"→ Creating bucket '{b}'…")
            try_create_bucket(b)
        else:
            print(f"  ✓ {b} already exists")

if __name__ == "__main__":
    main()
