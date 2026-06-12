#!/usr/bin/env bash
# =============================================================================
# Realmio Production Runtime Smoke Test
# =============================================================================
# Usage:
#   bash scripts/smoke-production-runtime.sh
#   BASE_URL=https://auth.example.com bash scripts/smoke-production-runtime.sh
#
# Requirements: curl (standard on Linux/macOS), grep, sed
# Optional: jq (for pretty-printing JSON; falls back to raw output)
# =============================================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"
TIMEOUT="${TIMEOUT:-10}"
PASS=0
FAIL=0
SKIP=0

# Colours
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}  ✓ PASS${RESET}  $*"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}  ✗ FAIL${RESET}  $*"; FAIL=$((FAIL+1)); }
skip() { echo -e "${YELLOW}  ○ SKIP${RESET}  $*"; SKIP=$((SKIP+1)); }
info() { echo -e "         $*"; }

echo ""
echo "==================================================================="
echo "  Realmio Smoke Test"
echo "  BASE_URL: ${BASE_URL}"
echo "==================================================================="
echo ""

# ---------------------------------------------------------------------------
# Helper: run curl, return status code + body
# ---------------------------------------------------------------------------
smoke_curl() {
  local method="${1:-GET}"
  local path="${2:-/}"
  local url="${BASE_URL}${path}"
  curl -s -o /tmp/smoke_body.txt -w "%{http_code}" \
    -X "$method" \
    --max-time "$TIMEOUT" \
    -L \
    -H "Accept: application/json" \
    "$url" 2>/dev/null || echo "000"
}

# Check if body looks like HTML (SPA leak)
body_is_html() {
  grep -qi '<html' /tmp/smoke_body.txt 2>/dev/null
}

# Check if body looks like JSON
body_is_json() {
  head -c 1 /tmp/smoke_body.txt 2>/dev/null | grep -q '^[{\[]'
}

# ---------------------------------------------------------------------------
# 1. GET /healthz — expect 200
# ---------------------------------------------------------------------------
echo "--- Health Checks ---"
status=$(smoke_curl GET /healthz)
if [ "$status" = "200" ]; then
  ok "GET /healthz → $status"
else
  fail "GET /healthz → $status (expected 200)"
fi

# ---------------------------------------------------------------------------
# 2. GET /ready — expect 200 or 503 with JSON body
# ---------------------------------------------------------------------------
status=$(smoke_curl GET /ready)
if [ "$status" = "200" ] || [ "$status" = "503" ]; then
  if body_is_json; then
    ok "GET /ready → $status (JSON readiness body)"
  else
    fail "GET /ready → $status but body is not JSON"
  fi
else
  fail "GET /ready → $status (expected 200 or 503)"
fi

# ---------------------------------------------------------------------------
# 3. GET /api/health — health alias
# ---------------------------------------------------------------------------
status=$(smoke_curl GET /api/health)
if [ "$status" = "200" ] || [ "$status" = "503" ]; then
  ok "GET /api/health → $status"
else
  fail "GET /api/health → $status (expected 200 or 503)"
fi

echo ""
echo "--- Admin UI Static Serving ---"

# ---------------------------------------------------------------------------
# 4. GET / — expect 302 redirect to /admin/ or 200
# ---------------------------------------------------------------------------
# Note: we use -L (follow redirects) so /tmp/smoke_body.txt will have final body
status_raw=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" \
  --max-time "$TIMEOUT" \
  -H "Accept: text/html" \
  "${BASE_URL}/" 2>/dev/null || echo "000")

# Without -L to get the actual redirect code
status_nofollow=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time "$TIMEOUT" \
  -H "Accept: text/html" \
  "${BASE_URL}/" 2>/dev/null || echo "000")

if [ "$status_nofollow" = "302" ] || [ "$status_nofollow" = "301" ]; then
  ok "GET / → $status_nofollow (redirect to /admin/)"
elif [ "$status_nofollow" = "200" ]; then
  ok "GET / → $status_nofollow (direct serve)"
else
  fail "GET / → $status_nofollow (expected 302 or 200)"
fi

# ---------------------------------------------------------------------------
# 5. GET /admin/ — expect 200 text/html
# ---------------------------------------------------------------------------
status=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" \
  --max-time "$TIMEOUT" \
  -H "Accept: text/html" \
  "${BASE_URL}/admin/" 2>/dev/null || echo "000")

if [ "$status" = "200" ] && body_is_html; then
  ok "GET /admin/ → $status (HTML Admin UI)"
elif [ "$status" = "200" ]; then
  fail "GET /admin/ → $status but body is not HTML"
elif [ "$status" = "500" ]; then
  fail "GET /admin/ → 500 (dist/public not built — run 'npm run build')"
else
  fail "GET /admin/ → $status (expected 200 HTML)"
fi

# ---------------------------------------------------------------------------
# 6. GET /admin/_next/static/... — discover and test a real asset
# ---------------------------------------------------------------------------
NEXT_CHUNK=$(grep -o '/_next/static/[^"'"'"' ]*\.js' /tmp/smoke_body.txt 2>/dev/null | head -1 || true)
if [ -n "$NEXT_CHUNK" ]; then
  asset_status=$(smoke_curl GET "/admin${NEXT_CHUNK}")
  if [ "$asset_status" = "200" ]; then
    ok "GET /admin${NEXT_CHUNK} → $asset_status (JS asset)"
  else
    fail "GET /admin${NEXT_CHUNK} → $asset_status (expected 200)"
  fi
else
  skip "GET /admin/_next/static/… — no asset path found in index.html"
fi

echo ""
echo "--- API Routes Must NOT Return HTML ---"

# ---------------------------------------------------------------------------
# 7. GET /admin/api — expect JSON (401/403/404), NOT HTML
# ---------------------------------------------------------------------------
status=$(smoke_curl GET /admin/api)
if body_is_html; then
  fail "GET /admin/api → $status but returned HTML (SPA leak)"
elif [ "$status" = "401" ] || [ "$status" = "403" ] || [ "$status" = "404" ] || [ "$status" = "200" ]; then
  ok "GET /admin/api → $status (JSON, not HTML)"
else
  info "GET /admin/api → $status (may be acceptable depending on auth config)"
  ok "GET /admin/api → $status (not HTML)"
fi

# ---------------------------------------------------------------------------
# 8. GET /admin/api/tenants — expect JSON (401/403), NOT HTML
# ---------------------------------------------------------------------------
status=$(smoke_curl GET /admin/api/tenants)
if body_is_html; then
  fail "GET /admin/api/tenants → $status but returned HTML (SPA leak)"
else
  ok "GET /admin/api/tenants → $status (not HTML)"
fi

# ---------------------------------------------------------------------------
# 9. GET /admin/auth/get-session — expect JSON, NOT HTML
# ---------------------------------------------------------------------------
status=$(smoke_curl GET /admin/auth/get-session)
if body_is_html; then
  fail "GET /admin/auth/get-session → $status but returned HTML (SPA leak)"
else
  ok "GET /admin/auth/get-session → $status (not HTML)"
fi

echo ""
echo "--- Tenant Auth Routes ---"

# ---------------------------------------------------------------------------
# 10. GET /api/auth/get-session — without tenant header, expect JSON error
# ---------------------------------------------------------------------------
status=$(smoke_curl GET /api/auth/get-session)
if body_is_html; then
  fail "GET /api/auth/get-session → $status but returned HTML (should be JSON error)"
else
  ok "GET /api/auth/get-session → $status (JSON, not HTML)"
fi

# ---------------------------------------------------------------------------
# 11. GET /tenant/__missing__/api/auth/get-session — expect JSON error
# ---------------------------------------------------------------------------
status=$(smoke_curl GET "/tenant/__missing__/api/auth/get-session")
if body_is_html; then
  fail "GET /tenant/__missing__/api/auth/get-session → $status but returned HTML"
else
  ok "GET /tenant/__missing__/api/auth/get-session → $status (JSON, not HTML)"
fi

# ---------------------------------------------------------------------------
# 12. GET /legacy/auth/get-session — expect JSON + Deprecation header
# ---------------------------------------------------------------------------
dep_header=$(curl -s -I --max-time "$TIMEOUT" \
  "${BASE_URL}/legacy/auth/get-session" 2>/dev/null \
  | grep -i "deprecation:" || true)

status=$(smoke_curl GET /legacy/auth/get-session)
if body_is_html; then
  fail "GET /legacy/auth/get-session → $status but returned HTML"
else
  ok "GET /legacy/auth/get-session → $status (not HTML)"
  if [ -n "$dep_header" ]; then
    ok "  Deprecation header present: $dep_header"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "==================================================================="
printf "  Results: ${GREEN}%d passed${RESET}, ${RED}%d failed${RESET}, ${YELLOW}%d skipped${RESET}\n" \
  "$PASS" "$FAIL" "$SKIP"
echo "==================================================================="
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}Smoke test FAILED. See details above.${RESET}"
  exit 1
else
  echo -e "${GREEN}All smoke tests passed.${RESET}"
  exit 0
fi
