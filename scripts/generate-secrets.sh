#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  generate-secrets.sh
#  Prints cryptographically-secure random values for every secret in .env.
#  Usage: bash scripts/generate-secrets.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

hex32()  { openssl rand -hex 32; }
hex16()  { openssl rand -hex 16; }
alpha32() {
  # 32 printable ASCII chars (letters + digits, no special chars for safety)
  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32
}

echo ""
echo "# ── Paste these into your .env file ──────────────────────────────────────"
echo ""
echo "POSTGRES_PASSWORD=$(hex32)"
echo ""
echo "MINIO_ROOT_PASSWORD=$(hex32)"
echo ""
echo "JWT_SECRET=$(hex32)"
echo ""
echo "JWT_REFRESH_SECRET=$(hex32)"
echo ""
echo "MFA_ENCRYPTION_KEY=$(alpha32)"
echo ""
echo "SESSION_SECRET=$(hex32)"
echo ""
echo "# ── ADMIN_PASSWORD — change this immediately after first login ───────────"
echo "ADMIN_PASSWORD=Admin@$(openssl rand -base64 8 | tr -d '=/+' | head -c 12)$(openssl rand -hex 2)"
echo ""
echo "# ─────────────────────────────────────────────────────────────────────────"
echo "# Tip: copy the values above, then: nano .env"
echo ""
