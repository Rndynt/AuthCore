#!/bin/bash
# Setup AuthCore in Single-Tenant Mode
# This creates only Better Auth tables for a dedicated instance

set -e

echo "🚀 Setting up AuthCore in SINGLE-TENANT mode..."
echo ""

# Check required environment variables
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL is not set"
  exit 1
fi

if [ -z "$TENANT_ID" ]; then
  echo "❌ ERROR: TENANT_ID is not set (required for single-tenant mode)"
  exit 1
fi

echo "📋 Configuration:"
echo "   Mode: SINGLE"
echo "   Tenant ID: $TENANT_ID"
echo "   Schema: ${TENANT_SCHEMA:-public}"
echo ""

# 1. Create Better Auth tables via Prisma
echo "📦 Step 1: Creating Better Auth tables..."
npx prisma db push --accept-data-loss
echo "✅ Better Auth tables created"
echo ""

# 2. Generate Prisma client
echo "📦 Step 2: Generating Prisma Client..."
npx prisma generate
echo "✅ Prisma Client generated"
echo ""

echo "✅ Single-tenant setup complete!"
echo ""
echo "🎯 Next steps:"
echo "   1. Set AUTH_MODE=single in your .env"
echo "   2. Set TENANT_ID=$TENANT_ID in your .env"
echo "   3. Run: npm run dev"
echo ""
