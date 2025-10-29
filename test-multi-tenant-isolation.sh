#!/bin/bash

echo "🧪 Testing Multi-Tenant Isolation"
echo "=================================="
echo ""

BASE_URL="http://localhost:5000"

echo "📋 Step 1: Check tenant registry"
echo "================================"
curl -s "$BASE_URL/admin/tenants" | jq .
echo ""

echo "📊 Step 2: Check connection stats"
echo "================================"
curl -s "$BASE_URL/admin/stats" | jq .
echo ""

echo "👤 Step 3: Create user in POS tenant"
echo "====================================="
curl -i -X POST "$BASE_URL/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: pos" \
  -d '{"email":"kasir@pos.com","password":"Passw0rd123!","name":"POS Kasir"}'
echo ""

echo "👤 Step 4: Create user in Ticketing tenant"
echo "==========================================="
curl -i -X POST "$BASE_URL/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: ticket" \
  -d '{"email":"admin@ticket.com","password":"Passw0rd123!","name":"Ticket Admin"}'
echo ""

echo "👤 Step 5: Create user in Crypto tenant"
echo "========================================"
curl -i -X POST "$BASE_URL/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: crypto" \
  -d '{"email":"trader@crypto.com","password":"Passw0rd123!","name":"Crypto Trader"}'
echo ""

echo "✅ Step 6: Verify data isolation"
echo "================================="
echo "Checking if users are isolated per tenant schema in database..."
echo ""

echo "🔍 Users in tenant_pos schema:"
psql $DATABASE_URL -c "SELECT email, name FROM tenant_pos.users;"
echo ""

echo "🔍 Users in tenant_ticket schema:"
psql $DATABASE_URL -c "SELECT email, name FROM tenant_ticket.users;"
echo ""

echo "🔍 Users in tenant_crypto schema:"
psql $DATABASE_URL -c "SELECT email, name FROM tenant_crypto.users;"
echo ""

echo "✅ Multi-tenant isolation test completed!"
