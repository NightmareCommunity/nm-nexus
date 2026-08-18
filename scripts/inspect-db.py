#!/usr/bin/env python3
"""Robust DB inspector using urllib with retries."""
import json
import urllib.request
import time

WORKER = "https://nm-nexus-sql-runner.ojaskhanna432.workers.dev"
TOKEN = "ojaskhanna432"

def run_sql(sql, retries=3):
    body = json.dumps({"sql": sql}).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                f"{WORKER}/query",
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "x-admin-token": TOKEN,
                    "User-Agent": "nm-nexus-migrator/1.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.loads(resp.read())
            if "error" in data:
                raise RuntimeError(data["error"])
            return data.get("rows", [])
        except Exception as e:
            if attempt == retries - 1:
                raise
            time.sleep(1)

def main():
    print("=== Tables in public schema ===")
    rows = run_sql("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE'
        ORDER BY table_name;
    """)
    table_list = [r['table_name'] for r in rows]
    for t in table_list:
        print(f"  - {t}")
    print(f"  Total: {len(table_list)}\n")

    print("=== All column listings ===")
    for t in table_list:
        try:
            cols = run_sql(f"""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema='public' AND table_name='{t}'
                ORDER BY ordinal_position;
            """)
            print(f"  {t}:")
            for c in cols:
                print(f"     {c['column_name']:30s} {c['data_type']:30s} {'NULL' if c['is_nullable']=='YES' else 'NOT NULL'}  def={c.get('column_default') or ''}")
            print()
        except Exception as e:
            print(f"  {t}: ERROR {e}\n")

    print("=== RLS policies count per table ===")
    rows = run_sql("""
        SELECT schemaname || '.' || tablename AS tbl, count(*) AS n
        FROM pg_policies
        WHERE schemaname='public'
        GROUP BY schemaname, tablename
        ORDER BY tablename;
    """)
    for r in rows:
        print(f"  {r['tbl']:40s} {r['n']} policies")
    print()

    print("=== Triggers (pg_trigger, not info_schema) ===")
    rows = run_sql("""
        SELECT tgrelid::regclass::text AS tbl, tgname
        FROM pg_trigger
        WHERE NOT tgisinternal
          AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)
        ORDER BY tbl, tgname;
    """)
    for r in rows:
        print(f"  {r['tbl']:30s} {r['tgname']}")
    print()

    print("=== Functions ===")
    rows = run_sql("""
        SELECT proname, pg_get_function_result(p.oid) AS result
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname='public'
        ORDER BY proname;
    """)
    for r in rows:
        print(f"  {r['proname']:40s} → {r['result']}")
    print()

    print("=== Storage buckets ===")
    try:
        rows = run_sql("SELECT id, name, public FROM storage.buckets ORDER BY id;")
        for r in rows:
            print(f"  - id={r['id']} name={r['name']} public={r['public']}")
        print()
    except Exception as e:
        print(f"  (error: {e})\n")

    print("=== auth.users (count only) ===")
    rows = run_sql("SELECT count(*) AS c FROM auth.users;")
    print(f"  users: {rows[0]['c']}\n")

if __name__ == "__main__":
    main()
