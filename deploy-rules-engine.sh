#!/bin/bash
set -e

echo "═══════════════════════════════════════════════════════════════"
echo "  SAFEHELD RULES ENGINE — DEPLOY & TEST"
echo "═══════════════════════════════════════════════════════════════"
echo ""

cd /opt/safeheld

echo "1. Pulling latest code..."
git pull origin main

echo ""
echo "2. Building API service..."
docker compose build api

echo ""
echo "3. Running database migration..."
docker compose exec -T api npx prisma migrate deploy

echo ""
echo "4. Generating Prisma client..."
docker compose exec -T api npx prisma generate

echo ""
echo "5. Seeding framework rules..."
docker compose exec -T api npx tsx prisma/seed-rules.ts

echo ""
echo "6. Restarting API service..."
docker compose up -d api

echo ""
echo "7. Waiting for API to be healthy..."
sleep 5
for i in {1..10}; do
  if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    echo "   API is healthy"
    break
  fi
  echo "   Waiting... ($i)"
  sleep 3
done

echo ""
echo "8. Running rules engine test against demo firms..."
docker compose exec -T api npx tsx src/services/rules-engine/test-demo-firms.ts

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
