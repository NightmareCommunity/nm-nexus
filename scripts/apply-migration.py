"""Apply the Supabase migration — use server-side executescript via simple query protocol.

Usage:
  SUPABASE_DB_URL=postgresql://... python3 scripts/apply-migration.py
"""
import os
import sys
import psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
if not DB_URL:
    print("ERROR: set SUPABASE_DB_URL or DATABASE_URL env var")
    sys.exit(1)
MIGRATION_PATH = "/home/z/my-project/supabase/migrations/0001_init.sql"

def main():
    if not os.path.exists(MIGRATION_PATH):
        print(f"ERROR: migration file not found at {MIGRATION_PATH}")
        sys.exit(1)

    with open(MIGRATION_PATH, "r") as f:
        sql = f.read()

    print(f"Connecting to Supabase pooler (ap-northeast-2)...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    # Drop any partially-created tables from previous failed runs
    print("Cleaning up any partial tables...")
    cur.execute("""
        DROP TABLE IF EXISTS public.profiles CASCADE;
        DROP TABLE IF EXISTS public.user_settings CASCADE;
        DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
        DROP FUNCTION IF EXISTS public.touch_updated_at() CASCADE;
        DROP FUNCTION IF EXISTS public.fetch_prekey_bundle(uuid) CASCADE;
    """)

    print(f"Executing migration ({len(sql)} bytes) via simple query protocol...")
    # Use the low-level protocol that supports multiple statements
    # psycopg2 cursors support multi-statement when you call execute() with a string
    # containing semicolons — but only via the simple query protocol.
    # The trick is to NOT use parameter substitution.
    try:
        # This executes the entire SQL string as a single query batch
        cur.execute(sql)
        print("Migration executed successfully.")
    except Exception as e:
        print(f"Single-batch failed: {e}")
        print("Trying statement-by-statement with proper $$ handling...")
        execute_statement_by_statement(cur, sql)

    # Verify
    print("\n=== Tables in public schema ===")
    cur.execute("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name;
    """)
    tables = [r[0] for r in cur.fetchall()]
    for t in tables:
        print(f"  - {t}")
    print(f"\nTotal: {len(tables)} tables")

    cur.execute("""
        SELECT count(*) FROM pg_policies WHERE schemaname = 'public';
    """)
    print(f"RLS policies: {cur.fetchone()[0]}")

    cur.execute("""
        SELECT count(*) FROM pg_trigger
        WHERE tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)
        AND NOT tgisinternal;
    """)
    print(f"Triggers: {cur.fetchone()[0]}")

    cur.close()
    conn.close()
    print("\nDone.")

def execute_statement_by_statement(cur, sql: str):
    """Split SQL respecting $$ dollar-quoted strings and standard SQL strings/comments."""
    statements = []
    current = []
    in_dollar_quote = False
    dollar_tag = None
    in_string = False
    in_line_comment = False
    in_block_comment = False
    i = 0
    while i < len(sql):
        ch = sql[i]
        nxt = sql[i+1] if i+1 < len(sql) else ''

        # Handle line comments
        if in_line_comment:
            current.append(ch)
            if ch == '\n':
                in_line_comment = False
            i += 1
            continue
        # Handle block comments
        if in_block_comment:
            current.append(ch)
            if ch == '*' and nxt == '/':
                current.append(nxt)
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue

        # Detect comment starts (only when not in string/dollar)
        if not in_dollar_quote and not in_string:
            if ch == '-' and nxt == '-':
                in_line_comment = True
                current.append(ch); current.append(nxt)
                i += 2
                continue
            if ch == '/' and nxt == '*':
                in_block_comment = True
                current.append(ch); current.append(nxt)
                i += 2
                continue

        # Handle dollar quotes
        if not in_string and ch == '$':
            # Try to match $tag$ pattern
            end = sql.find('$', i+1)
            while end != -1:
                tag_candidate = sql[i:end+1]
                # Validate tag content (alphanumeric + underscore)
                tag_inner = tag_candidate[1:-1]
                if tag_inner == '' or all(c.isalnum() or c == '_' for c in tag_inner):
                    break
                end = sql.find('$', end+1)
            if end != -1:
                tag = sql[i:end+1]
                if not in_dollar_quote:
                    in_dollar_quote = True
                    dollar_tag = tag
                    current.append(tag)
                    i = end + 1
                    continue
                elif tag == dollar_tag:
                    in_dollar_quote = False
                    dollar_tag = None
                    current.append(tag)
                    i = end + 1
                    continue

        # Handle single-quoted strings
        if not in_dollar_quote and ch == "'":
            if nxt == "'":
                current.append(ch); current.append(nxt)
                i += 2
                continue
            in_string = not in_string

        current.append(ch)
        if ch == ';' and not in_string and not in_dollar_quote:
            stmt = ''.join(current).strip()
            # Strip leading comments
            lines = stmt.split('\n')
            code_lines = [l for l in lines if not l.strip().startswith('--')]
            code = '\n'.join(code_lines).strip()
            if code:
                statements.append(stmt)
            current = []
        i += 1
    if current:
        stmt = ''.join(current).strip()
        if stmt:
            statements.append(stmt)

    print(f"  Split into {len(statements)} statements")
    ok = 0
    failed = 0
    for i, stmt in enumerate(statements, 1):
        try:
            cur.execute(stmt)
            ok += 1
        except Exception as e:
            msg = str(e).lower()
            if 'already exists' in msg:
                pass  # idempotent
            else:
                failed += 1
                print(f"  [{i}] FAILED: {str(e)[:100]}")
                first_code_line = next((l for l in stmt.split('\n') if l.strip() and not l.strip().startswith('--')), '')[:100]
                print(f"       STMT: {first_code_line}")
    print(f"  Result: {ok} OK, {failed} failed")

if __name__ == "__main__":
    main()
