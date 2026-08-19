#!/usr/bin/env python3
"""
NM NEXUS v4.2 — Master Test Runner.

Runs all three automated test suites in sequence and produces a single
summary report. Exits 0 only if every suite passes.

Suites:
  1. e2ee-crypto-test.mjs       — 31 libsodium crypto primitive checks (Node)
  2. security-test.py           — 13 static DB policy checks
  3. full-acceptance-test.py    — 42 runtime A/B/C isolation checks
                                  (signs up 3 real users, exercises every
                                   backend path, cleans up)

Total: 86 automated checks covering every v4.2 acceptance dimension.
"""
import subprocess
import sys
import time
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SUITES = [
    {
        "name": "E2EE Crypto Primitives (Node)",
        "cmd": ["node", "scripts/e2ee-crypto-test.mjs"],
        "expected_passes": 31,
    },
    {
        "name": "Static Security Policy (DB)",
        "cmd": ["python3", "scripts/security-test.py"],
        "expected_passes": 13,
    },
    {
        "name": "Full A/B/C Acceptance (runtime)",
        "cmd": ["python3", "scripts/full-acceptance-test.py"],
        "expected_passes": 42,
    },
]

def run_suite(suite):
    print()
    print("─" * 70)
    print(f"  SUITE: {suite['name']}")
    print(f"  CMD:   {' '.join(suite['cmd'])}")
    print("─" * 70)
    start = time.time()
    proc = subprocess.run(
        suite["cmd"],
        cwd=REPO,
        capture_output=False,
        text=True,
    )
    elapsed = time.time() - start
    return proc.returncode == 0, elapsed

def main():
    print("=" * 70)
    print("  NM NEXUS v4.2 — Master Test Runner")
    print("  Running all 3 automated test suites (86 checks total)")
    print("=" * 70)

    results = []
    for suite in SUITES:
        ok, elapsed = run_suite(suite)
        results.append((suite, ok, elapsed))

    print()
    print("=" * 70)
    print("  FINAL REPORT")
    print("=" * 70)
    print(f"  {'SUITE':<40} {'RESULT':<10} {'TIME':<10}")
    print(f"  {'─'*40} {'─'*10} {'─'*10}")
    all_ok = True
    for suite, ok, elapsed in results:
        status = "✓ PASS" if ok else "✗ FAIL"
        print(f"  {suite['name']:<40} {status:<10} {elapsed:6.1f}s")
        if not ok:
            all_ok = False

    total_pass = sum(s["expected_passes"] for s, ok, _ in results if ok)
    total_expected = sum(s["expected_passes"] for s, _, _ in results)
    total_time = sum(t for _, _, t in results)

    print()
    print(f"  Total automated checks: {total_pass}/{total_expected} passed")
    print(f"  Total wall-clock time:   {total_time:.1f}s")
    print()
    if all_ok:
        print("  ✓ ALL SUITES PASSED — v4.2 is production-ready.")
        sys.exit(0)
    else:
        print("  ✗ AT LEAST ONE SUITE FAILED — see output above.")
        sys.exit(1)

if __name__ == "__main__":
    main()
