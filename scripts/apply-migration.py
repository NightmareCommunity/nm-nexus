#!/usr/bin/env python3
"""Apply NM NEXUS SQL migration to Supabase via direct Postgres connection."""
import os
import sys
import psycopg2
from pathlib import Path

DB_URL = os.environ.get(
    "SUPABASE_DB_URL",
    "postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres",
)
SQL_FILE = Path("/home/z/my-project/supabase/migrations/0001_init.sql")

def main():
    print(f"→ Connecting to Supabase…")
    try:
        conn = psycopg2.connect(DB_URL, connect_timeout=15)
    except Exception as e:
        print(f"✖ Connection failed: {e}")
        sys.exit(1)
    conn.autocommit = True
    cur = conn.cursor()

    sql = SQL_FILE.read_text()
    print(f"→ Applying {len(sql)} bytes of SQL from {SQL_FILE.name}…")

    # Split on semicolons at line ends (simple split — statements end with ;)
    # Use psycopg2's execute for the whole thing — it handles multiple statements
    try:
        cur.execute(sql)
        print("✓ Migration applied successfully")
    except Exception as e:
        # Try line-by-line for better error messages
        print(f"⚠ Bulk execute failed: {e}")
        print("→ Trying statement-by-statement…")
        stmts = []
        cur_stmt = ""
        for line in sql.split("\n"):
            stripped = line.strip()
            if stripped.startswith("--"):
                continue
            cur_stmt += line + "\n"
            if stripped.endswith(";"):
                stmts.append(cur_stmt.strip())
                cur_stmt = ""
        if cur_stmt.strip():
            stmts.append(cur_stmt.strip())

        ok = 0
        failed = 0
        for s in stmts:
            if not s:
                continue
            try:
                cur.execute(s)
                ok += 1
            except Exception as e2:
                msg = str(e2).strip()
                # Ignore "already exists" errors (idempotent migration)
                if "already exists" in msg or "does not exist" in msg and "drop" in s.lower():
                    pass
                else:
                    failed += 1
                    print(f"  ✖ {msg[:120]}")
        print(f"✓ {ok} statements OK, {failed} failed")

    # Verify tables exist
    cur.execute("""
        select table_name from information_schema.tables
        where table_schema='public' and table_type='BASE TABLE'
        order by table_name
    """)
    tables = [r[0] for r in cur.fetchall()]
    print(f"→ Tables in 'public' schema ({len(tables)}):")
    for t in tables:
        print(f"    • {t}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
