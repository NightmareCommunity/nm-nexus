#!/usr/bin/env python3
"""Check Supabase DB connectivity and list existing tables/RLS state."""
import psycopg2
import os
import sys

DB_URL = os.environ.get(
    "SUPABASE_DB_URL",
    "postgresql://postgres:ojaskhanna432@db.juzmgejicviennjcykxq.supabase.co:5432/postgres",
)

def main():
    print(f"→ Connecting to: {DB_URL.split('@')[1] if '@' in DB_URL else DB_URL}")
    try:
        conn = psycopg2.connect(DB_URL, connect_timeout=15)
    except Exception as e:
        print(f"✗ Connection failed: {e}")
        sys.exit(1)

    cur = conn.cursor()
    print("✓ Connected\n")

    print("=== Tables in 'public' schema ===")
    cur.execute("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema='public'
        ORDER BY table_name;
    """)
    tables = [r[0] for r in cur.fetchall()]
    for t in tables:
        print(f"  - {t}")
    print(f"  Total: {len(tables)}\n")

    print("=== Auth users count ===")
    try:
        cur.execute("SELECT count(*) FROM auth.users;")
        print(f"  users: {cur.fetchone()[0]}\n")
    except Exception as e:
        print(f"  (cannot read auth.users: {e})\n")

    print("=== Storage buckets ===")
    try:
        cur.execute("SELECT id, name, public FROM storage.buckets ORDER BY id;")
        for r in cur.fetchall():
            print(f"  - {r}")
        print()
    except Exception as e:
        print(f"  (cannot read storage.buckets: {e})\n")

    print("=== RLS enabled tables ===")
    cur.execute("""
        SELECT relname, relrowsecurity
        FROM pg_class
        WHERE relnamespace='public'::regnamespace
          AND relkind='r'
        ORDER BY relname;
    """)
    for r in cur.fetchall():
        print(f"  - {r[0]}: RLS={'ON' if r[1] else 'OFF'}")
    print()

    print("=== Profiles count ===")
    try:
        cur.execute("SELECT count(*) FROM public.profiles;")
        print(f"  profiles: {cur.fetchone()[0]}\n")
    except Exception as e:
        print(f"  (no profiles table: {e})\n")

    print("=== Communities count ===")
    try:
        cur.execute("SELECT count(*) FROM public.communities;")
        print(f"  communities: {cur.fetchone()[0]}\n")
    except Exception as e:
        print(f"  (no communities table: {e})\n")

    print("=== Channels count ===")
    try:
        cur.execute("SELECT count(*) FROM public.channels;")
        print(f"  channels: {cur.fetchone()[0]}\n")
    except Exception as e:
        print(f"  (no channels table: {e})\n")

    print("=== Messages count ===")
    try:
        cur.execute("SELECT count(*) FROM public.messages;")
        print(f"  messages: {cur.fetchone()[0]}\n")
    except Exception as e:
        print(f"  (no messages table: {e})\n")

    cur.close()
    conn.close()
    print("✓ Done")

if __name__ == "__main__":
    main()
