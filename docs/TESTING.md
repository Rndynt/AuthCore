# AuthCore Testing Guide

## Overview

This guide covers testing AuthCore across all operational modes.

## Test Scripts

Test scripts are provided for quick verification of each mode.

### Test Single-Tenant Mode

```bash
# Create test script
cat > test-single.sh << 'EOF'
#!/bin/bash
set -e

echo "🧪 Testing Single-Tenant AuthCore..."
echo ""

# Verify health
echo "1️⃣ Health check..."
HEALTH=$(curl -s http://localhost:5000/healthz)
echo "Response: $HEALTH"
if echo "$HEALTH" | grep -q '"mode":"single"'; then
  echo "✅ Single-tenant mode confirmed"
else
  echo "❌ Wrong mode detected"
  exit 1
fi

# Test signup
echo ""
echo "2️⃣ Testing user signup..."
SIGNUP=$(curl -s -X POST http://localhost:5000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "test@example.com",
    "password": "Test123456!",
    "name": "Test User"
  }')

if echo "$SIGNUP" | grep -q '"email":"test@example.com"'; then
  echo "✅ Signup successful"
  USER_ID=$(echo "$SIGNUP" | jq -r '.user.id')
  TOKEN=$(echo "$SIGNUP" | jq -r '.token')
  echo "   User ID: $USER_ID"
else
  echo "❌ Signup failed"
  echo "$SIGNUP"
  exit 1
fi

# Test signin
echo ""
echo "3️⃣ Testing user signin..."
SIGNIN=$(curl -s -X POST http://localhost:5000/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "test@example.com",
    "password": "Test123456!"
  }')

if echo "$SIGNIN" | grep -q '"email":"test@example.com"'; then
  echo "✅ Signin successful"
else
  echo "❌ Signin failed"
  exit 1
fi

echo ""
echo "✅ All tests passed!"
EOF

chmod +x test-single.sh
./test-single.sh
```

### Test Multi-Tenant Mode

```bash
# Create test script
cat > test-multi.sh << 'EOF'
#!/bin/bash
set -e

echo "🧪 Testing Multi-Tenant AuthCore..."
echo ""

# Verify health
echo "1️⃣ Health check..."
HEALTH=$(curl -s http://localhost:5000/healthz)
echo "Response: $HEALTH"
if echo "$HEALTH" | grep -q '"mode":"multi"'; then
  echo "✅ Multi-tenant mode confirmed"
else
  echo "❌ Wrong mode detected"
  exit 1
fi

# Test POS tenant signup
echo ""
echo "2️⃣ Testing POS tenant signup..."
POS_SIGNUP=$(curl -s -X POST http://localhost:5000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-Id: pos' \
  -d '{
    "email": "pos@example.com",
    "password": "Test123456!",
    "name": "POS User"
  }')

if echo "$POS_SIGNUP" | grep -q '"email":"pos@example.com"'; then
  echo "✅ POS signup successful"
else
  echo "❌ POS signup failed"
  echo "$POS_SIGNUP"
  exit 1
fi

# Test Crypto tenant signup
echo ""
echo "3️⃣ Testing Crypto tenant signup..."
CRYPTO_SIGNUP=$(curl -s -X POST http://localhost:5000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-Id: crypto' \
  -d '{
    "email": "crypto@example.com",
    "password": "Test123456!",
    "name": "Crypto User"
  }')

if echo "$CRYPTO_SIGNUP" | grep -q '"email":"crypto@example.com"'; then
  echo "✅ Crypto signup successful"
else
  echo "❌ Crypto signup failed"
  exit 1
fi

# Verify tenant isolation
echo ""
echo "4️⃣ Verifying tenant isolation..."
POS_COUNT=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM tenant_pos.users;")
CRYPTO_COUNT=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM tenant_crypto.users;")

echo "   POS users: $POS_COUNT"
echo "   Crypto users: $CRYPTO_COUNT"

if [ "$POS_COUNT" -eq 1 ] && [ "$CRYPTO_COUNT" -eq 1 ]; then
  echo "✅ Data isolation verified"
else
  echo "❌ Data isolation failed"
  exit 1
fi

echo ""
echo "✅ All tests passed!"
EOF

chmod +x test-multi.sh
./test-multi.sh
```

### Test Nested Tenancy Mode

```bash
# Create test script
cat > test-nested.sh << 'EOF'
#!/bin/bash
set -e

echo "🧪 Testing Nested Tenancy AuthCore..."
echo ""

# Verify health
echo "1️⃣ Health check..."
HEALTH=$(curl -s http://localhost:5000/healthz)
echo "Response: $HEALTH"
if echo "$HEALTH" | grep -q '"nestedTenancy":true'; then
  echo "✅ Nested tenancy enabled"
else
  echo "❌ Nested tenancy not enabled"
  exit 1
fi

# Test sub-tenant exists
echo ""
echo "2️⃣ Verifying sub-tenants..."
SUB_TENANTS=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM public.application_sub_tenants;")
echo "   Sub-tenants found: $SUB_TENANTS"

if [ "$SUB_TENANTS" -gt 0 ]; then
  echo "✅ Sub-tenants table populated"
else
  echo "❌ No sub-tenants found"
  exit 1
fi

# Test POS Cafe A user
echo ""
echo "3️⃣ Testing POS::Cafe-A user signup..."
CAFE_A_SIGNUP=$(curl -s -X POST http://localhost:5000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-Id: pos::cafe-a' \
  -d '{
    "email": "cafea@example.com",
    "password": "Test123456!",
    "name": "Cafe A User"
  }')

if echo "$CAFE_A_SIGNUP" | grep -q '"email":"cafea@example.com"'; then
  echo "✅ Cafe A signup successful"
else
  echo "❌ Cafe A signup failed"
  echo "$CAFE_A_SIGNUP"
  exit 1
fi

echo ""
echo "✅ All tests passed!"
EOF

chmod +x test-nested.sh
./test-nested.sh
```

## Manual Testing

### Using curl

```bash
# Single-tenant mode
curl -X POST http://localhost:5000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "name": "John Doe"
  }'

# Multi-tenant mode
curl -X POST http://localhost:5000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-Id: pos' \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "name": "John Doe"
  }'

# Nested tenancy
curl -X POST http://localhost:5000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-Id: pos::cafe-a' \
  -d '{
    "email": "staff@cafea.com",
    "password": "SecurePass123!",
    "name": "Cafe Staff"
  }'
```

### Database Verification

```bash
# Check tenant registry
psql $DATABASE_URL -c "SELECT id, name, status FROM public.tenants;"

# Check sub-tenants
psql $DATABASE_URL -c "SELECT id, application_id, name FROM public.application_sub_tenants;"

# Check users in specific tenant
psql $DATABASE_URL -c "SELECT id, email, name FROM tenant_pos.users;"

# Check isolation
psql $DATABASE_URL -c "
  SELECT 
    'tenant_pos' as tenant, COUNT(*) as users FROM tenant_pos.users
  UNION ALL
  SELECT 
    'tenant_crypto' as tenant, COUNT(*) as users FROM tenant_crypto.users;
"
```

## Integration Testing

### Postman Collection

Import the provided Postman collection:

```json
{
  "info": {
    "name": "AuthCore API Tests",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Health Check",
      "request": {
        "method": "GET",
        "header": [],
        "url": "{{baseUrl}}/healthz"
      }
    },
    {
      "name": "Sign Up (Single/Multi)",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          },
          {
            "key": "X-Tenant-Id",
            "value": "{{tenantId}}",
            "description": "Required for multi-tenant mode"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"email\": \"{{$randomEmail}}\",\n  \"password\": \"Test123456!\",\n  \"name\": \"{{$randomFullName}}\"\n}"
        },
        "url": "{{baseUrl}}/api/auth/sign-up/email"
      }
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:5000"
    },
    {
      "key": "tenantId",
      "value": "pos"
    }
  ]
}
```

## Performance Testing

### Load Test with Apache Bench

```bash
# Single-tenant load test
ab -n 1000 -c 10 \
  -H "Content-Type: application/json" \
  -p signup.json \
  http://localhost:5000/api/auth/sign-up/email

# Multi-tenant load test
ab -n 1000 -c 10 \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: pos" \
  -p signup.json \
  http://localhost:5000/api/auth/sign-up/email
```

### Expected Performance

| Mode | RPS | Latency (p95) | Notes |
|------|-----|---------------|-------|
| Single | 200+ | <100ms | With proper indexing |
| Multi | 150+ | <150ms | 3 active tenants |
| Hybrid | 100+ | <200ms | 50+ sub-tenants |

## Troubleshooting

### Common Test Failures

**Error: Tenant not found**
```bash
# Check tenant exists
psql $DATABASE_URL -c "SELECT * FROM public.tenants WHERE id='pos';"

# If missing, re-run setup
bash scripts/setup-multi.sh
```

**Error: CORS**
```bash
# Add origin to TRUSTED_ORIGINS
export TRUSTED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

**Error: Database connection**
```bash
# Verify DATABASE_URL
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1;"
```

## Next Steps

- [Installation Guide](./INSTALLATION.md)
- [Configuration Guide](./CONFIGURATION.md)
- [Deployment Guide](./DEPLOYMENT_MODES.md)
- [API Documentation](./API.md)
