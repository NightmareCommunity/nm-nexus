#!/usr/bin/env python3
"""Apply SQL migration to Supabase DB via the sql-runner Cloudflare Worker."""
import json
import urllib.request
import sys
import time
from pathlib import Path

WORKER = "https://nm-nexus-sql-runner.ojaskhanna432.workers.dev"
TOKEN = "ojaskhanna432"

def post(path, sql):
    body = json.dumps({"sql": sql}).encode()
    req = urllib.request.Request(
        f"{WORKER}{path}",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-admin-token": TOKEN,
            "User-Agent": "nm-nexus-migrator/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read())

def apply_migration(sql_path):
    sql = Path(sql_path).read_text()
    print(f"→ Applying {sql_path} ({len(sql)} bytes)…")
    result = post("/sql", sql)
    if "error" in result:
        print(f"✗ Worker error: {result['error']}")
        return False
    results = result.get("results", [])
    ok = sum(1 for r in results if r.get("ok"))
    skipped = sum(1 for r in results if r.get("skipped"))
    failed = [r for r in results if not r.get("ok")]
    print(f"  ✓ {ok} succeeded, {skipped} skipped (idempotent), {len(failed)} failed")
    for f in failed[:10]:
        print(f"    FAIL: {f.get('error')}")
        print(f"      snippet: {f.get('snippet')}")
    return len(failed) == 0

def main():
    sql_file = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/supabase/migrations/0004_discord_additions.sql"
    success = apply_migration(sql_file)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
