#!/bin/bash
# Setup AuthCore in Multi-Tenant Mode (without nested tenancy)
# This creates tenant registry + Better Auth tables

set -e

echo "🚀 Setting up AuthCore in MULTI-TENANT mode..."
echo ""

# Check required environment variables
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL is not set"
  exit 1
fi

echo "📋 Configuration:"
echo "   Mode: MULTI"
echo "   Nested Tenancy: DISABLED"
echo ""

# 1. Create tenant registry tables
echo "📦 Step 1: Creating tenant registry..."
cat src/multi-tenant/schema.sql | psql $DATABASE_URL
echo "✅ Tenant registry created"
echo ""

# 2. Create Better Auth tables via Prisma
echo "📦 Step 2: Creating Better Auth tables..."
npx prisma db push --accept-data-loss
echo "✅ Better Auth tables created"
echo ""

# 3. Provision tenant schemas
echo "📦 Step 3: Provisioning tenant schemas..."
npx tsx src/multi-tenant/provision-schemas.ts
echo "✅ Tenant schemas provisioned"
echo ""

# 4. Generate Prisma client
echo "📦 Step 4: Generating Prisma Client..."
npx prisma generate
echo "✅ Prisma Client generated"
echo ""

echo "✅ Multi-tenant setup complete!"
echo ""
echo "🎯 Next steps:"
echo "   1. Set AUTH_MODE=multi in your .env"
echo "   2. Set NESTED_TENANCY_ENABLED=false in your .env"
echo "   3. Run: npm run dev"
echo ""
