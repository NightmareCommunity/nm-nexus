#!/usr/bin/env python3
"""Test Supabase DB connection and run migration with error reporting."""
import psycopg2
import sys
import traceback

DB_URL = "postgresql://postgres:ojaskhanna432@db.juzmgejicviennjcykxq.supabase.co:5432/postgres"

def main():
    print("=" * 60)
    print("Testing connection to Supabase DB...")
    print("=" * 60)
    try:
        conn = psycopg2.connect(DB_URL, connect_timeout=15)
        conn.autocommit = True
        cur = conn.cursor()

        # List existing tables
        cur.execute("""
            select tablename from pg_tables
            where schemaname='public' order by tablename;
        """)
        existing_tables = [r[0] for r in cur.fetchall()]
        print(f"Existing public tables ({len(existing_tables)}):")
        for t in existing_tables:
            print(f"  - {t}")

        # List publications and tables in supabase_realtime
        cur.execute("""
            select schemaname, tablename
            from pg_publication_tables
            where pubname = 'supabase_realtime'
            order by tablename;
        """)
        realtime_tables = [(r[0], r[1]) for r in cur.fetchall()]
        print(f"\nTables already in supabase_realtime publication ({len(realtime_tables)}):")
        for s, t in realtime_tables:
            print(f"  - {s}.{t}")

        # Check existing storage buckets
        cur.execute("select id, name, public from storage.buckets order by id;")
        buckets = cur.fetchall()
        print(f"\nExisting storage buckets ({len(buckets)}):")
        for b in buckets:
            print(f"  - {b}")

        # Check existing triggers
        cur.execute("""
            select tgname, tgrelid::regclass::text, tgenabled
            from pg_trigger
            where not tgisinternal
            order by tgname;
        """)
        triggers = cur.fetchall()
        print(f"\nExisting triggers ({len(triggers)}):")
        for t in triggers:
            print(f"  - {t}")

        # Check existing functions
        cur.execute("""
            select proname, lanname
            from pg_proc p
            join pg_language l on p.prolang = l.oid
            join pg_namespace n on p.pronamespace = n.oid
            where n.nspname = 'public'
            order by proname;
        """)
        funcs = cur.fetchall()
        print(f"\nExisting public functions ({len(funcs)}):")
        for f in funcs:
            print(f"  - {f}")

        # Check existing policies
        cur.execute("""
            select tablename, policyname
            from pg_policies
            where schemaname in ('public', 'storage')
            order by tablename, policyname;
        """)
        policies = cur.fetchall()
        print(f"\nExisting RLS policies ({len(policies)}):")
        for p in policies:
            print(f"  - {p[0]}.{p[1]}")

        cur.close()
        conn.close()
        print("\n✅ Connection successful")
        return 0

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
