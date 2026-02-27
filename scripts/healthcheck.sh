#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  healthcheck.sh
#  Verifies all Safeheld services are running and healthy.
#  Usage: bash scripts/healthcheck.sh [HOST]
#  Default HOST: localhost
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HOST="${1:-localhost}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local cmd="$2"
  if eval "$cmd" &>/dev/null; then
    echo "  [OK]  $name"
    ((PASS++)) || true
  else
    echo "  [FAIL] $name"
    ((FAIL++)) || true
  fi
}

echo ""
echo "Safeheld health check — host: $HOST"
echo "──────────────────────────────────────"

echo ""
echo "Docker containers:"
check "postgres"    "docker compose ps postgres | grep -q 'healthy'"
check "redis"       "docker compose ps redis    | grep -q 'healthy'"
check "minio"       "docker compose ps minio    | grep -q 'healthy'"
check "api"         "docker compose ps api      | grep -q 'healthy'"
check "web"         "docker compose ps web      | grep -q 'running\|Up'"

echo ""
echo "HTTP endpoints:"
check "API health  (http://$HOST:3001/api/v1/health)" \
  "curl -sf http://$HOST:3001/api/v1/health"
check "Web UI      (http://$HOST)"                     \
  "curl -sf http://$HOST | grep -qi html"
check "MinIO API   (http://$HOST:9000/minio/health/live)" \
  "curl -sf http://$HOST:9000/minio/health/live"

echo ""
echo "──────────────────────────────────────"
echo "Passed: $PASS  |  Failed: $FAIL"
echo ""

if [[ $FAIL -gt 0 ]]; then
  echo "Some checks failed. Run 'docker compose logs -f' to investigate."
  exit 1
else
  echo "All checks passed!"
fi
