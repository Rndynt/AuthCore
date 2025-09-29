# AuthCore — Fastify + Better-Auth (Headless Authentication Service)

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)
![Database](https://img.shields.io/badge/Database-PostgreSQL%20%2B%20Prisma-blue)
![Deployment](https://img.shields.io/badge/Deploy-Netlify%20Functions-00C7B7)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Table of Contents

- [Overview](#overview)
- [Feature Matrix](#feature-matrix)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Installation & Run](#installation--run)
- [HTTP Endpoints (Core)](#http-endpoints-core)
- [Service-to-Service Patterns](#service-to-service-patterns)
- [Organizations (Multi-Tenant)](#organizations-multi-tenant)
- [Admin Operations](#admin-operations)
- [DEV QA Endpoints](#dev-qa-endpoints)
- [CORS & Cookies](#cors--cookies)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [Smoke Tests](#smoke-tests)
- [Roadmap](#roadmap)
- [License](#license)
- [Changelog](#changelog)

## Overview

AuthCore is a headless authentication microservice designed to serve multiple applications and microservices. It provides comprehensive authentication and authorization capabilities including:

- **End-user authentication**: Email/password with cookie sessions
- **Service-to-service auth**: API Keys and JWT/Bearer tokens with offline verification
- **Multi-tenant organizations**: Role-based access control (owner/admin/member)
- **Admin operations**: User management, session control, and development tooling

**Example Deployments:**
- **Production (Netlify)**: https://your-auth-service.netlify.app
- **Development (Replit)**: https://your-replit-project.replit.dev

This service is framework-agnostic and can be consumed by Next.js, React, Node.js, Go, or any HTTP client.

## Feature Matrix

| Feature | Status | Description |
|---------|--------|-------------|
| **End-User Auth** | ✅ | Email/password signup, signin, cookie sessions |
| **Session Inspect** | ✅ | GET `/me` endpoint resolves identity from cookie/API key/Bearer |
| **API Key Auth** | ✅ | S2S via `x-api-key` header (creates mock session) |
| **JWT/Bearer** | ✅ | Short-lived JWT tokens with JWKS for offline verification |
| **Organizations** | ✅ | Multi-tenant with roles (owner/admin/member) |
| **Admin Panel** | ✅ | List users, impersonation (dev), key management |
| **CORS + Credentials** | ✅ | trustedOrigins with cookie credential support |
| **Fastify Transport** | ✅ | High-performance async HTTP server |
| **Netlify Deploy** | ✅ | Serverless functions with redirects |
| **Replit Dev** | ✅ | Cloud development environment |
| **QA Endpoints** | ✅ | Comprehensive dev/testing endpoints (guarded) |

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Microservice   │    │   Admin Panel   │
│   (React/Next)  │    │   (Node/Go/etc)  │    │   (Internal)    │
└─────────┬───────┘    └─────────┬────────┘    └─────────┬───────┘
          │                      │                       │
          │ Cookie Session       │ x-api-key /          │ Cookie +
          │                      │ Authorization:        │ Admin Role
          │                      │ Bearer JWT            │
          └──────────┬───────────┴─────────┬─────────────┘
                     │                     │
                ┌────▼─────────────────────▼────┐
                │         AuthCore              │
                │    Fastify + Better-Auth      │
                │                               │
                │  /api/auth/*  │  /me  │ /dev/*│
                └────────┬──────────────────────┘
                         │
                    ┌────▼────┐    ┌─────────────────┐
                    │ Prisma  │────│   PostgreSQL    │
                    │ Adapter │    │  (Neon/Cloud)   │
                    └─────────┘    └─────────────────┘

Netlify Deployment:
/api/auth/* → /.netlify/functions/auth

JWKS Verification (Offline):
Resource Service → GET /dev/jwks.json → Verify JWT locally
```

## Prerequisites

- **Node.js** >= 18
- **Package Manager**: npm, pnpm, or yarn
- **Database**: PostgreSQL (Neon recommended for serverless)

## Environment Variables

Create a `.env` file or set environment variables:

```env
# Server Configuration
PORT=5000
BETTER_AUTH_URL=https://your-auth-service-domain.com
BETTER_AUTH_SECRET=your-super-long-random-secret-key-min-24-characters

# Database (PostgreSQL with TLS for serverless)
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require

# CORS & Security
TRUSTED_ORIGINS=https://your-frontend.com,https://your-admin-panel.com,http://localhost:3000

# Development Only
ENABLE_DEV_ENDPOINTS=false
```

### Environment Notes

- **PORT**: Replit automatically sets `process.env.PORT`. Listen on `0.0.0.0:${PORT}`
- **BETTER_AUTH_URL**: Must match your public domain (Netlify in prod, Replit in dev)
- **TRUSTED_ORIGINS**: Comma-separated list of domains allowed for CORS with credentials
- **DATABASE_URL**: Include `?sslmode=require` for serverless PostgreSQL (Neon, Supabase, etc.)
- **ENABLE_DEV_ENDPOINTS**: Set to `true` only in development/QA. NEVER in production.

## Database Setup

### Recommended: Neon PostgreSQL

```bash
# Example connection string
DATABASE_URL="postgresql://user:password@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

### Schema Migration Sequence

```bash
# 1. Generate Prisma client
npm run prisma:gen

# 2. Generate Better-Auth extensions
npx @better-auth/cli generate prisma --yes

# 3. Run migrations (production) OR dev migration
npm run prisma:deploy || npm run prisma:migrate

# 4. Regenerate client after schema changes
npm run prisma:gen
```

### Fresh Development Only

If migrations are unavailable, you can push schema directly:
```bash
npx prisma db push
```

**Note**: Use migrations in production for safe schema changes.

## Installation & Run

### Netlify Deployment

1. **Set Environment Variables** in Netlify dashboard:
   ```
   BETTER_AUTH_URL=https://your-site.netlify.app
   BETTER_AUTH_SECRET=your-secret-key
   TRUSTED_ORIGINS=https://your-frontend.com
   DATABASE_URL=postgresql://...?sslmode=require
   ENABLE_DEV_ENDPOINTS=false
   ```

2. **netlify.toml** (already configured):
   ```toml
   [[redirects]]
     from = "/api/auth/*"
     to = "/.netlify/functions/auth"
     status = 200
   ```

3. **Test Build Locally**:
   ```bash
   npm run netlify:build
   npm run netlify:serve
   ```

### Replit Development

1. **Set Secrets** in Replit Secrets tab:
   - `DATABASE_URL`
   - `BETTER_AUTH_SECRET`
   - `TRUSTED_ORIGINS`
   - `ENABLE_DEV_ENDPOINTS=true`

2. **Run Development Server**:
   ```bash
   npm run dev
   ```
   Listens on `0.0.0.0:${PORT}` (automatically configured)

### Local Development

```bash
# Install dependencies
npm install

# Set up database
npm run prisma:gen
npx @better-auth/cli generate prisma --yes
npm run prisma:migrate
npm run prisma:gen

# Start development server
npm run dev
```

## HTTP Endpoints (Core)

### Authentication Flow

**Base URLs:**
- **Netlify**: `https://your-auth-service.netlify.app`
- **Replit**: `https://your-replit-project.replit.dev`

#### Sign Up

```bash
# Netlify
curl -i -c cookie.txt -X POST https://your-auth-service.netlify.app/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  --data '{"email":"demo@example.com","password":"SecurePass123!"}'

# Replit
curl -i -c cookie.txt -X POST https://your-replit-project.replit.dev/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  --data '{"email":"demo@example.com","password":"SecurePass123!"}'
```

**Response**: Sets `better-auth.session_token` cookie + JSON user object

#### Sign In

```bash
# Netlify
curl -i -c cookie.txt -X POST https://your-auth-service.netlify.app/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  --data '{"email":"demo@example.com","password":"SecurePass123!"}'

# Replit
curl -i -c cookie.txt -X POST https://your-replit-project.replit.dev/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  --data '{"email":"demo@example.com","password":"SecurePass123!"}'
```

#### Get Session

```bash
# Netlify
curl -i -b cookie.txt https://your-auth-service.netlify.app/api/auth/session

# Replit
curl -i -b cookie.txt https://your-replit-project.replit.dev/api/auth/session
```

#### Identity Resolution (`/me`)

The `/me` endpoint resolves identity from cookie, API key, or Bearer token:

```bash
# Using cookie
curl -i -b cookie.txt https://your-auth-service.netlify.app/me

# Using API key (see S2S section)
curl -i -H "x-api-key: YOUR_API_KEY" https://your-auth-service.netlify.app/me

# Using Bearer token (see S2S section)
curl -i -H "Authorization: Bearer YOUR_JWT" https://your-auth-service.netlify.app/me
```

## Service-to-Service Patterns

### API Key Authentication

API Keys create a mock session of the key owner, enabling the same RBAC checks as user sessions.

**Use case**: Internal microservices, background jobs, service accounts

```bash
# 1. Create API Key (requires authenticated session)
curl -i -c cookie.txt -b cookie.txt -X POST https://your-auth-service.netlify.app/dev/api-keys \
  -H "Content-Type: application/json" \
  --data '{"label":"orders-service","expiresInDays":90}'

# Response: {"key":"ak_1234567890abcdef","keyId":"key_id","userId":"user_id",...}

# 2. Use API Key for authentication
curl -i -H "x-api-key: ak_1234567890abcdef" https://your-auth-service.netlify.app/me
```

### JWT/Bearer Token + JWKS

For stateless, offline verification by resource servers.

**Use case**: Distributed microservices, third-party integrations, mobile apps

```bash
# 1. Issue short-lived JWT (requires authenticated session)
curl -i -c cookie.txt -b cookie.txt -X POST https://your-auth-service.netlify.app/dev/jwt/issue \
  -H "Content-Type: application/json" \
  --data '{"ttlSeconds":1800,"audience":"orders-api","scopes":["orders:read"]}'

# Response: {"token":"eyJhbGciOiJSUzI1NiIs...","expiresAt":"2024-01-01T12:00:00Z"}

# 2. Use Bearer token
curl -i -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." https://your-auth-service.netlify.app/me

# 3. Resource servers verify offline using JWKS
curl -s https://your-auth-service.netlify.app/dev/jwks.json
```

#### Node.js JWT Verification Example

```typescript
import { jwtVerify, createRemoteJWKSet } from 'jose'

const JWKS = createRemoteJWKSet(
  new URL('https://your-auth-service.netlify.app/dev/jwks.json')
)

async function verifyJWT(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'https://your-auth-service.netlify.app',
      audience: 'orders-api'
    })
    return payload
  } catch (error) {
    throw new Error('Invalid token')
  }
}
```

## Organizations (Multi-Tenant)

Organizations enable multi-tenancy with role-based access control.

**Concepts:**
- **Organization**: Tenant/workspace containing users
- **Roles**: `owner` (full control), `admin` (manage members), `member` (basic access)
- **Membership**: User's role within a specific organization

**Typical Flow:**
1. Create organization → 2. Invite/add members → 3. Set roles → 4. Pass org context to downstream services

### Organization Management (Dev Endpoints)

```bash
# 1. Create Organization
curl -i -c cookie.txt -b cookie.txt -X POST https://your-auth-service.netlify.app/dev/orgs \
  -H "Content-Type: application/json" \
  --data '{"name":"Acme Corporation"}'

# Response: {"org":{"id":"org_1234","name":"Acme Corporation","slug":"acme-corporation"}}

# 2. Add Member
curl -i -c cookie.txt -b cookie.txt -X POST https://your-auth-service.netlify.app/dev/orgs/org_1234/members \
  -H "Content-Type: application/json" \
  --data '{"email":"member@example.com","role":"admin"}'

# 3. Update Member Role
curl -i -c cookie.txt -b cookie.txt -X PATCH https://your-auth-service.netlify.app/dev/orgs/org_1234/members/user_5678 \
  -H "Content-Type: application/json" \
  --data '{"role":"owner"}'

# 4. List Members
curl -i https://your-auth-service.netlify.app/dev/orgs/org_1234/members
```

**Downstream Context**: Pass `X-Org-Id: org_1234` header to your microservices to scope operations to the specific organization.

## Admin Operations

Admin capabilities include user management, session control, and system operations.

**Security**: Protect admin routes behind private networks, VPNs, or internal-only domains.

### Admin Endpoints (Dev Mode)

```bash
# List Users (admin only)
curl -i -c cookie.txt -b cookie.txt https://your-auth-service.netlify.app/dev/admin/users?limit=50

# Impersonate User (DEV ONLY - returns JWT)
curl -i -c cookie.txt -b cookie.txt -X POST https://your-auth-service.netlify.app/dev/admin/impersonate \
  -H "Content-Type: application/json" \
  --data '{"userId":"user_1234","as":"jwt"}'

# Impersonate User (DEV ONLY - sets session cookie)
curl -i -c cookie.txt -b cookie.txt -X POST https://your-auth-service.netlify.app/dev/admin/impersonate \
  -H "Content-Type: application/json" \
  --data '{"userId":"user_1234","as":"cookie"}'
```

## DEV QA Endpoints

⚠️ **CRITICAL WARNING**: These endpoints are for development and QA only. **NEVER enable in production**.

Enable by setting `ENABLE_DEV_ENDPOINTS=true`. All `/dev/*` routes return 404 when disabled.

### Authentication Methods

All dev endpoints support three authentication methods:
- **Cookie**: Standard session-based (from sign-in)
- **API Key**: Header `x-api-key: <key>`
- **Bearer Token**: Header `Authorization: Bearer <jwt>`

### Available Endpoints

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/dev/whoami` | GET | Show identity, auth method, org memberships | Yes |
| `/dev/api-keys` | POST | Create API key (self/admin) | Yes |
| `/dev/api-keys` | GET | List API keys (`?userId=...`) | Yes |
| `/dev/api-keys/:keyId` | DELETE | Revoke API key | Yes |
| `/dev/jwt/issue` | POST | Issue short-lived JWT | Yes |
| `/dev/jwks.json` | GET | JWKS for JWT verification | **No** (Public) |
| `/dev/orgs` | POST | Create organization | Yes |
| `/dev/orgs/:orgId/members` | POST | Add org member | Yes (owner/admin) |
| `/dev/orgs/:orgId/members/:userId` | PATCH | Update member role | Yes (owner/admin) |
| `/dev/orgs/:orgId/members` | GET | List org members | Yes (any member) |
| `/dev/admin/users` | GET | List users (`?limit=50`) | Yes (admin) |
| `/dev/admin/impersonate` | POST | Impersonate user | Yes (admin) |

### Usage Examples

**Base URLs:**
- **Netlify**: `https://your-auth-service.netlify.app`
- **Replit**: `https://your-replit-project.replit.dev`

#### Identity & Status

```bash
# WHOAMI (cookie-based)
curl -i -c cookie.txt -b cookie.txt https://your-auth-service.netlify.app/dev/whoami
curl -i -c cookie.txt -b cookie.txt https://your-replit-project.replit.dev/dev/whoami

# WHOAMI (API key)
curl -i -H "x-api-key: YOUR_API_KEY" https://your-auth-service.netlify.app/dev/whoami

# WHOAMI (Bearer token)
curl -i -H "Authorization: Bearer YOUR_JWT" https://your-auth-service.netlify.app/dev/whoami
```

#### API Key Management

```bash
# Create API Key
curl -i -c cookie.txt -b cookie.txt -X POST https://your-auth-service.netlify.app/dev/api-keys \
  -H "Content-Type: application/json" \
  --data '{"label":"orders-svc","expiresInDays":90}'

curl -i -c cookie.txt -b cookie.txt -X POST https://your-replit-project.replit.dev/dev/api-keys \
  -H "Content-Type: application/json" \
  --data '{"label":"orders-svc","expiresInDays":90}'

# List API Keys
curl -i -c cookie.txt -b cookie.txt https://your-auth-service.netlify.app/dev/api-keys
curl -i -c cookie.txt -b cookie.txt https://your-replit-project.replit.dev/dev/api-keys

# Revoke API Key
curl -i -c cookie.txt -b cookie.txt -X DELETE https://your-auth-service.netlify.app/dev/api-keys/KEY_ID
curl -i -c cookie.txt -b cookie.txt -X DELETE https://your-replit-project.replit.dev/dev/api-keys/KEY_ID
```

#### JWT & JWKS

```bash
# Issue JWT Token
curl -i -c cookie.txt -b cookie.txt -X POST https://your-auth-service.netlify.app/dev/jwt/issue \
  -H "Content-Type: application/json" \
  --data '{"ttlSeconds":1800,"audience":"orders-api","scopes":["orders:read"]}'

curl -i -c cookie.txt -b cookie.txt -X POST https://your-replit-project.replit.dev/dev/jwt/issue \
  -H "Content-Type: application/json" \
  --data '{"ttlSeconds":1800,"audience":"orders-api","scopes":["orders:read"]}'

# Get JWKS (Public endpoint)
curl -s https://your-auth-service.netlify.app/dev/jwks.json
curl -s https://your-replit-project.replit.dev/dev/jwks.json
```

#### Organization Management

```bash
# Create Organization
curl -i -c cookie.txt -b cookie.txt -X POST https://your-auth-service.netlify.app/dev/orgs \
  -H "Content-Type: application/json" \
  --data '{"name":"Acme Corp"}'

curl -i -c cookie.txt -b cookie.txt -X POST https://your-replit-project.replit.dev/dev/orgs \
  -H "Content-Type: application/json" \
  --data '{"name":"Acme Corp"}'

# Add Member
curl -i -c cookie.txt -b cookie.txt -X POST https://your-auth-service.netlify.app/dev/orgs/ORG_ID/members \
  -H "Content-Type: application/json" \
  --data '{"email":"member@example.com","role":"admin"}'

# Update Member Role
curl -i -c cookie.txt -b cookie.txt -X PATCH https://your-auth-service.netlify.app/dev/orgs/ORG_ID/members/USER_ID \
  -H "Content-Type: application/json" \
  --data '{"role":"owner"}'

# List Members
curl -i https://your-auth-service.netlify.app/dev/orgs/ORG_ID/members
curl -i https://your-replit-project.replit.dev/dev/orgs/ORG_ID/members
```

#### Admin Functions

```bash
# List Users (admin only)
curl -i -c cookie.txt -b cookie.txt https://your-auth-service.netlify.app/dev/admin/users?limit=50
curl -i -c cookie.txt -b cookie.txt https://your-replit-project.replit.dev/dev/admin/users?limit=50

# Impersonate User - Return JWT (DEV ONLY)
curl -i -c cookie.txt -b cookie.txt -X POST https://your-auth-service.netlify.app/dev/admin/impersonate \
  -H "Content-Type: application/json" \
  --data '{"userId":"USER_ID","as":"jwt"}'

# Impersonate User - Set Cookie (DEV ONLY)
curl -i -c cookie.txt -b cookie.txt -X POST https://your-auth-service.netlify.app/dev/admin/impersonate \
  -H "Content-Type: application/json" \
  --data '{"userId":"USER_ID","as":"cookie"}'
```

### ⚠️ Production Warning

**NEVER set `ENABLE_DEV_ENDPOINTS=true` in production**. These endpoints expose sensitive administrative functions and should only be used in controlled development/QA environments.

## CORS & Cookies

### Browser Requirements

- **Credentials**: Browsers must send `credentials: 'include'` for cookie-based auth
- **Origin Whitelist**: Add your frontend domain to `TRUSTED_ORIGINS`

### Cookie Configuration

- **Secure**: Enabled in production (HTTPS)
- **HttpOnly**: Yes (prevents XSS access)
- **SameSite**: `Lax` for same-origin, `None` for cross-origin (with Secure)

### Netlify Considerations

- **multiValueHeaders**: Handled automatically via `session.cookieCache=false`
- **Single Cookie**: Simplifies serverless function cookie handling

### Frontend Example

```javascript
// React/Next.js fetch example
const response = await fetch('https://your-auth-service.netlify.app/api/auth/sign-in/email', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // Required for cookies
  body: JSON.stringify({ email, password })
})
```

## Security Notes

### Development vs Production

- **DEV Endpoints**: Keep `ENABLE_DEV_ENDPOINTS=false` in production
- **Admin Access**: Restrict admin routes to private networks or VPNs
- **Secrets**: Use secure secret management (Netlify Environment Variables, etc.)

### API Key Management

- **Rotation**: Implement regular API key rotation
- **Storage**: Store API keys securely (encrypted databases, secret vaults)
- **Scope**: Use minimal required permissions per key

### JWT Best Practices

- **Short TTLs**: Use 15-30 minutes for JWT tokens
- **Validation**: Always validate `iss` (issuer), `aud` (audience), and `exp` (expiry)
- **JWKS**: Regularly rotate signing keys via JWKS endpoint

### Audit & Monitoring

- **Admin Actions**: Log all administrative operations
- **Failed Logins**: Monitor for brute force attacks
- **API Key Usage**: Track API key access patterns

## Troubleshooting

### 422 PrismaClientValidationError on Sign-up

**Symptoms**: Users can't sign up, getting validation errors

**Solutions**:
1. Verify `DATABASE_URL` includes `?sslmode=require` for serverless PostgreSQL
2. Run complete schema setup:
   ```bash
   npm run prisma:gen
   npx @better-auth/cli generate prisma --yes
   npm run prisma:migrate
   npm run prisma:gen
   ```
3. Check for Express/Vite remnants in codebase (should be Fastify)
4. Ensure Fastify handler correctly forwards request body and headers

### CORS/Credentials Blocked

**Symptoms**: Browser blocks requests, "credentials not allowed" errors

**Solutions**:
1. Add frontend domain to `TRUSTED_ORIGINS`: `https://yourapp.com,http://localhost:3000`
2. Ensure frontend sends `credentials: 'include'`
3. Verify `BETTER_AUTH_URL` matches the actual deployed domain

### Replit PORT Binding Issues

**Symptoms**: Service starts but isn't accessible via Replit's web view

**Solutions**:
1. Always listen on `0.0.0.0:${PORT}`, not `localhost` or `127.0.0.1`
2. Verify `process.env.PORT` is used (Replit sets this automatically)
3. Check that `BETTER_AUTH_URL` uses the Replit domain, not localhost

### Netlify Cookie Issues

**Symptoms**: Cookies not set properly in serverless environment

**Solutions**:
1. Ensure `session.cookieCache=false` in Better-Auth config (single cookie)
2. If using multiple cookies, enable `multiValueHeaders` in `netlify.toml`
3. Verify `BETTER_AUTH_URL` matches exact Netlify domain

### Database Connection Failures

**Symptoms**: "Connection refused" or SSL errors

**Solutions**:
1. Add `?sslmode=require` to PostgreSQL connection string for cloud providers
2. Check firewall/network settings for database provider
3. Verify connection string format: `postgresql://user:pass@host:port/db?sslmode=require`

## Smoke Tests

### Basic Authentication Flow

```bash
#!/bin/bash
BASE_NETLIFY="https://your-auth-service.netlify.app"
BASE_REPLIT="https://your-replit-project.replit.dev"

echo "=== Testing Netlify ==="

# Sign up
echo "Testing sign-up..."
curl -i -c cookie.txt -X POST $BASE_NETLIFY/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  --data '{"email":"smoke-test@example.com","password":"TestPass123!"}'

# Sign in
echo "Testing sign-in..."
curl -i -c cookie.txt -X POST $BASE_NETLIFY/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  --data '{"email":"smoke-test@example.com","password":"TestPass123!"}'

# Get session
echo "Testing session..."
curl -i -b cookie.txt $BASE_NETLIFY/api/auth/session

# Test /me endpoint
echo "Testing /me..."
curl -i -b cookie.txt $BASE_NETLIFY/me

echo "=== Testing Replit ==="

# Repeat for Replit
curl -i -c cookie-replit.txt -X POST $BASE_REPLIT/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  --data '{"email":"smoke-test-replit@example.com","password":"TestPass123!"}'

curl -i -b cookie-replit.txt $BASE_REPLIT/me
```

### DEV Endpoints Smoke Test (Requires ENABLE_DEV_ENDPOINTS=true)

```bash
#!/bin/bash
BASE="https://your-replit-project.replit.dev"

# Prerequisites: Sign in first
curl -i -c cookie.txt -X POST $BASE/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  --data '{"email":"admin@example.com","password":"AdminPass123!"}'

# Test whoami
echo "Testing /dev/whoami..."
curl -i -b cookie.txt $BASE/dev/whoami

# Create API Key
echo "Creating API key..."
API_KEY_RESPONSE=$(curl -s -b cookie.txt -X POST $BASE/dev/api-keys \
  -H "Content-Type: application/json" \
  --data '{"label":"smoke-test-key","expiresInDays":1}')

API_KEY=$(echo $API_KEY_RESPONSE | jq -r '.key')

# Test API Key auth
echo "Testing API key auth..."
curl -i -H "x-api-key: $API_KEY" $BASE/dev/whoami

# Issue JWT
echo "Issuing JWT..."
JWT_RESPONSE=$(curl -s -b cookie.txt -X POST $BASE/dev/jwt/issue \
  -H "Content-Type: application/json" \
  --data '{"ttlSeconds":1800,"audience":"smoke-test"}')

JWT_TOKEN=$(echo $JWT_RESPONSE | jq -r '.token')

# Test JWT auth
echo "Testing JWT auth..."
curl -i -H "Authorization: Bearer $JWT_TOKEN" $BASE/dev/whoami

# Test JWKS
echo "Testing JWKS..."
curl -s $BASE/dev/jwks.json | jq

echo "All smoke tests completed!"
```

### Success Criteria

- **2xx HTTP status codes** for all requests
- **Set-Cookie headers** present on sign-up/sign-in
- **JSON responses** with expected user/session data
- **JWKS endpoint** returns valid JSON Web Key Set
- **API Key/JWT authentication** resolves to correct user identity

## Roadmap

### Near Term
- [ ] Admin Dashboard UI (separate React app)
- [ ] Audit logging for admin actions
- [ ] Organization-owned API keys
- [ ] Rate limiting per API key
- [ ] Email verification workflows

### Medium Term
- [ ] Social OAuth providers (Google, GitHub)
- [ ] Two-factor authentication (TOTP)
- [ ] Session management UI
- [ ] Webhook notifications for events

### Long Term
- [ ] Multi-region deployment
- [ ] Advanced RBAC permissions engine
- [ ] SSO integration (SAML)
- [ ] Compliance certifications (SOC 2)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Changelog

### v1.2.0 - 2025-09-29

- **Documentation**: Complete rewrite of README with comprehensive feature guide
- **Service-to-Service**: Documented API Key and JWT/Bearer authentication patterns
- **DEV QA Endpoints**: Full documentation of all development/testing endpoints with examples
- **Troubleshooting**: Added comprehensive troubleshooting section covering Prisma, CORS, TLS, and deployment issues
- **Examples**: All examples validated against live Netlify and Replit deployments
- **Security**: Enhanced security documentation and production deployment guidelines

### v1.1.0 - 2025-09-15

- **Organizations**: Multi-tenant organization support with role-based access control
- **Admin Panel**: Administrative endpoints for user management and system operations
- **JWT/JWKS**: JSON Web Token issuance and validation with JWKS endpoint
- **API Keys**: Service-to-service authentication via API keys

### v1.0.0 - 2025-09-01

- **Initial Release**: Fastify + Better-Auth integration with Prisma PostgreSQL
- **Core Auth**: Email/password authentication with cookie sessions
- **Deployment**: Netlify Functions and Replit development support
- **CORS**: Cross-origin request support with credentials

---

For detailed implementation guides, see:
- [JWT/JWKS Integration Guide](docs/jwt-jwks.md)
- [Organizations & Multi-Tenancy](docs/organizations.md)