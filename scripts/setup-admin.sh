#!/bin/bash
# Setup AuthCore Admin System
# Creates authcore_system schema and admin authentication

set -e

echo "🚀 Setting up AuthCore Admin System..."
echo ""

# Check required environment variables
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL is not set"
  exit 1
fi

echo "📋 Configuration:"
echo "   Admin Schema: authcore_system"
echo "   Isolation: Complete (separate from tenant data)"
echo ""

# 1. Create admin schema and tables
echo "📦 Step 1: Creating authcore_system schema..."
cat scripts/setup-admin-schema.sql | psql $DATABASE_URL
echo "✅ Admin schema created"
echo ""

echo "✅ Admin system setup complete!"
echo ""
echo "🎯 Next steps:"
echo "   1. Start the server: npm run dev"
echo "   2. Create admin user: POST /admin/auth/sign-up/email"
echo "   3. Login: POST /admin/auth/sign-in/email"
echo "   4. Access admin API: /admin/api/*"
echo ""
echo "📝 Admin Credentials Example:"
echo "   Email: admin@authcore.local"
echo "   Password: AuthCore123!"
echo ""
