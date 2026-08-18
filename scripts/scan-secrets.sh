#!/usr/bin/env bash
# NM NEXUS — Secret scanner
# Scans the repo for accidentally committed secrets before pushing.
# Run: bash scripts/scan-secrets.sh

set -e

echo "🔒 NM NEXUS secret scanner"
echo "─────────────────────────────"

# Patterns that indicate a leaked secret
PATTERNS=(
  # Supabase
  'sb_secret_[a-zA-Z0-9_]{20,}'
  'sb_publishable_[a-zA-Z0-9_]{20,}'
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+'  # JWT
  'postgres://[^:]+:[^@]+@[a-z0-9.-]+\.supabase\.co'

  # Cloudflare
  'cfat_[a-zA-Z0-9]{40,}'
  'CLOUDFLARE_API_TOKEN=[a-zA-Z0-9_-]{20,}'

  # GitHub
  'ghp_[a-zA-Z0-9]{36}'
  'github_pat_[a-zA-Z0-9_]{40,}'

  # Generic API keys
  '[aA]pi[_-]?[kK]ey\s*[:=]\s*["'"'"'][a-zA-Z0-9_-]{20,}'
  '[sS]ecret\s*[:=]\s*["'"'"'][a-zA-Z0-9_-]{20,}'
  'password\s*[:=]\s*["'"'"'][a-zA-Z0-9_-]{8,}'

  # AWS
  'AKIA[0-9A-Z]{16}'
  'aws_secret_access_key\s*[:=]\s*[a-zA-Z0-9/+=]{40}'

  # R2 / S3
  '[a-f0-9]{32}'  # looks like an Access Key ID
)

# Files to skip (binary, node_modules, etc.)
SKIP_DIRS='node_modules|.next|.git|dist|build|out|android/build|.wrangler'
SKIP_EXT='png|jpg|jpeg|gif|webp|ico|svg|woff|woff2|ttf|eot|mp4|webm|mp3|wav|pdf|zip|tar|gz'

# Forbidden filenames
FORBIDDEN_FILES=(
  '.env'
  '.env.local'
  '.env.production'
  '.env.development'
  'MAIN.txt'
  'credentials.txt'
  'secrets.txt'
  '*.pem'
  '*.key'
  '*.keystore'
  '*.jks'
  'google-services.json'
  'GoogleService-Info.plist'
)

violations=0

# Check for forbidden files
echo "Checking for forbidden files…"
for pattern in "${FORBIDDEN_FILES[@]}"; do
  if find . -not -path "./node_modules/*" -not -path "./.next/*" -not -path "./.git/*" -name "$pattern" -print 2>/dev/null | grep -q .; then
    echo "❌ Found forbidden file matching: $pattern"
    find . -not -path "./node_modules/*" -not -path "./.next/*" -not -path "./.git/*" -name "$pattern" -print
    violations=$((violations + 1))
  fi
done

# Check for secret patterns in source files
echo "Scanning source files for secret patterns…"
for pattern in "${PATTERNS[@]}"; do
  matches=$(grep -rEIn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.json" --include="*.md" --include="*.yml" --include="*.yaml" --include="*.toml" --include="*.sh" --include="*.env*" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=dist --exclude-dir=build \
    "$pattern" . 2>/dev/null || true)
  if [ -n "$matches" ]; then
    # Filter out .env.example matches (those are placeholders)
    real_matches=$(echo "$matches" | grep -v ".env.example" | grep -v "your-" | grep -v "EXAMPLE" | grep -v "placeholder" || true)
    if [ -n "$real_matches" ]; then
      echo "❌ Pattern '$pattern' found:"
      echo "$real_matches"
      violations=$((violations + 1))
    fi
  fi
done

echo "─────────────────────────────"
if [ "$violations" -eq 0 ]; then
  echo "✅ No secrets detected. Safe to push."
  exit 0
else
  echo "❌ $violations violation(s) detected. Fix before pushing!"
  exit 1
fi
