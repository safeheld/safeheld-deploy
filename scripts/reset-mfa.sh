#!/bin/bash
# Reset MFA for a user by email. Run inside the api container:
#   docker compose exec api npx ts-node -e "..." OR use this script via:
#   docker compose exec postgres psql -U safeheld -d safeheld -c "..."
#
# Usage: ./scripts/reset-mfa.sh [email]
# Default: admin@safeheld.com

EMAIL="${1:-admin@safeheld.com}"

echo "Resetting MFA for: $EMAIL"
docker compose exec postgres psql -U safeheld -d safeheld -c \
  "UPDATE users SET mfa_secret = NULL, mfa_enabled = false WHERE email = '$EMAIL';"
echo "Done. User will be prompted to set up MFA on next login."
