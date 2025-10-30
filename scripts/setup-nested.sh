#!/bin/bash
# Setup AuthCore in Hybrid Mode (with nested tenancy support)
# This creates tenant registry + sub-tenant tables + Better Auth tables

set -e

echo "🚀 Setting up AuthCore in HYBRID mode (nested tenancy)..."
echo ""

# Check required environment variables
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL is not set"
  exit 1
fi

echo "📋 Configuration:"
echo "   Mode: MULTI"
echo "   Nested Tenancy: ENABLED"
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

# 3. Create nested tenancy tables
echo "📦 Step 3: Creating nested tenancy tables..."
cat src/multi-tenant/nested-schema.sql | psql $DATABASE_URL
echo "✅ Nested tenancy tables created"
echo ""

# 4. Provision tenant schemas
echo "📦 Step 4: Provisioning tenant schemas..."
npx tsx src/multi-tenant/provision-schemas.ts
echo "✅ Tenant schemas provisioned"
echo ""

# 5. Generate Prisma client
echo "📦 Step 5: Generating Prisma Client..."
npx prisma generate
echo "✅ Prisma Client generated"
echo ""

echo "✅ Hybrid mode setup complete!"
echo ""
echo "🎯 Next steps:"
echo "   1. Set AUTH_MODE=multi in your .env"
echo "   2. Set NESTED_TENANCY_ENABLED=true in your .env"
echo "   3. Run: npm run dev"
echo ""
echo "📚 Sub-tenants have been created for testing:"
echo "   - pos::cafe-a (Cafe A)"
echo "   - pos::cafe-b (Cafe B)"
echo "   - pos::resto-c (Restaurant C)"
echo ""
