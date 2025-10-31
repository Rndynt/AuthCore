#!/bin/bash
set -e

BASE_URL="http://localhost:5000"
echo "=== Testing Auth Service Endpoints ==="
echo ""

echo "1. Test /info endpoint (should show multi-tenant mode)"
curl -s "$BASE_URL/info" | jq .
echo ""

echo "2. Create admin user via API (tenant: pos)"
curl -s -X POST "$BASE_URL/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: pos" \
  -d '{"email":"admin@authcore.local","password":"AdminPass123!","name":"Admin User"}' \
  -c cookies.txt -b cookies.txt | jq . || echo "User might already exist or error occurred"
echo ""

echo "3. Sign in as admin (tenant: pos)"
curl -s -X POST "$BASE_URL/api/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: pos" \
  -d '{"email":"admin@authcore.local","password":"AdminPass123!"}' \
  -c cookies.txt -b cookies.txt | jq .
echo ""

echo "4. Get session (tenant: pos)"
curl -s "$BASE_URL/api/auth/get-session" \
  -H "X-Tenant-Id: pos" \
  -b cookies.txt | jq .
echo ""

echo "5. Test tenant: ticket - signup"
curl -s -X POST "$BASE_URL/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: ticket" \
  -d '{"email":"user@ticket.local","password":"TicketPass123!","name":"Ticket User"}' | jq . || echo "User might already exist"
echo ""

echo "6. Test tenant: crypto - signup"
curl -s -X POST "$BASE_URL/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: crypto" \
  -d '{"email":"user@crypto.local","password":"CryptoPass123!","name":"Crypto User"}' | jq . || echo "User might already exist"
echo ""

echo "7. Test dev whoami endpoint"
curl -s "$BASE_URL/dev/whoami" -b cookies.txt | jq .
echo ""

echo "8. List tenants (requires admin)"
curl -s "$BASE_URL/admin/api/tenants" -b cookies.txt | jq . || echo "Might need admin auth"
echo ""

echo "=== Tests Complete ===" 
