#!/usr/bin/env python3
"""Run SQL on the live Supabase DB via the nm-nexus-sql-runner Cloudflare Worker."""
import json
import sys
import urllib.request
from pathlib import Path

WORKER = "https://nm-nexus-sql-runner.ojaskhanna432.workers.dev"
TOKEN = "ojaskhanna432"

def run_sql(sql: str, verbose: bool = True):
    body = json.dumps({"sql": sql}).encode()
    req = urllib.request.Request(
        f"{WORKER}/sql",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-admin-token": TOKEN,
            "User-Agent": "nm-nexus-migrator/1.1",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        result = json.loads(resp.read())
    if "error" in result and "results" not in result:
        print(f"FATAL: {result['error']}", file=sys.stderr)
        sys.exit(1)
    results = result.get("results", [])
    ok = sum(1 for r in results if r.get("ok"))
    failed = [r for r in results if not r.get("ok")]
    if verbose:
        print(f"  ✓ {ok} ok, {len(failed)} failed, {len(results)} total")
        for f in failed[:20]:
            print(f"    FAIL: {f.get('error')}")
            if f.get("detail"):
                print(f"      detail: {f.get('detail')}")
            if f.get("hint"):
                print(f"      hint: {f.get('hint')}")
            print(f"      snippet: {f.get('snippet','')[:150]}")
    return results

def main():
    if len(sys.argv) < 2:
        print("Usage: run-sql.py <file.sql|-string=>' | -e \"<sql>\"", file=sys.stderr)
        sys.exit(2)
    arg = sys.argv[1]
    if arg == "-e":
        sql = sys.argv[2]
    else:
        sql = Path(arg).read_text()
    print(f"→ Running {len(sql)} bytes of SQL…")
    results = run_sql(sql)
    # Show any row data we got back
    for i, r in enumerate(results):
        if r.get("rows"):
            print(f"  result[{i}]: {r['rows']}")

if __name__ == "__main__":
    main()
