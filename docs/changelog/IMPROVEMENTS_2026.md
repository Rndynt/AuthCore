# AuthCore Improvements & Bug Fixes - 2026

## Overview

Comprehensive codebase analysis, bug fixes, security improvements, and new feature implementations.

---

## 🐛 Bug Fixes

### Bug 1: Broken CIDR Matching in Security Settings
**File:** [`src/domain/tenant/security-settings.ts`](../../src/domain/tenant/security-settings.ts)

**Problem:** The `isIpBlocked()` function used a naive prefix-matching approach for CIDR ranges that was incorrect and could miss valid IP blocks or produce false positives.

**Fix:** Replaced with proper bitwise CIDR matching using IPv4 subnet mask calculation. The function now correctly handles IPv4 CIDR ranges (e.g., `192.168.1.0/24`).

**Note:** For production use, the `src/utils/ip-utils.ts` module with `ipaddr.js` provides full IPv4/IPv6 CIDR support and is used by `tenant-service.ts`.

---

### Bug 2: Wrong Table Names in Tenant Schema Provisioning
**File:** [`src/infrastructure/db/tenant-repository.ts`](../../src/infrastructure/db/tenant-repository.ts)

**Problem:** The `provisionTenantSchema()` function used incorrect table names (`users`, `accounts`, `sessions`, etc.) that didn't match the actual Better Auth table names defined in the Prisma schema via `@@map` directives.

**Fix:** Updated to use the correct Better Auth table names:
- `user` (not `users`)
- `session` (not `sessions`)
- `account` (not `accounts`)
- `verification`
- `organization`
- `member`
- `invitation`
- `apikey`
- `jwks`
- `two_factor` (new)

Also added dynamic table existence checking to avoid errors when tables don't exist yet.

---

### Bug 3: Type Mismatch in createSupportSession Interface
**File:** [`src/admin/admin-api.ts`](../../src/admin/admin-api.ts)

**Problem:** The `AdminApiTenantService` interface declared `createSupportSession()` as returning `Promise<string>`, but the actual implementation in `tenant-service.ts` returns `Promise<{ token: string; expiresAt: Date }>`.

**Fix:** Updated the interface to match the actual return type: `Promise<{ token: string; expiresAt: Date }>`.

---

### Bug 4: Rate Limiting Not Applied to Multi-Tenant Auth Routes
**File:** [`src/server.ts`](../../src/server.ts)

**Problem:** The multi-tenant `/api/auth/*` route was missing the `config: { rateLimit: createAuthRateLimit() }` configuration that was present on the single-tenant route.

**Fix:** Added rate limiting configuration to the multi-tenant auth route.

---

### Bug 5: Missing schemaValidated Field in Connection Metadata
**File:** [`src/multi-tenant/connection-manager.ts`](../../src/multi-tenant/connection-manager.ts)

**Problem:** The `touchConnectionMetadata()` function created metadata objects without the `schemaValidated` field, causing TypeScript type inconsistency. Also, new connections were marked as `schemaValidated: true` without actually validating.

**Fix:** 
- New connections now start with `schemaValidated: false`
- `touchConnectionMetadata()` now includes `schemaValidated: false` in new metadata objects

---

### Bug 6: Netlify Function Using Sync getTenantAuth
**File:** [`netlify/functions/tenant-auth.ts`](../../netlify/functions/tenant-auth.ts)

**Problem:** The Netlify function was calling `getTenantAuth()` synchronously, but the function is async (returns a Promise).

**Fix:** Changed to `await getTenantAuth(tenantId)`.

---

## 🔒 Security Improvements

### Security Headers Added
**File:** [`src/server.ts`](../../src/server.ts)

Added comprehensive security headers to all responses:
- `X-Content-Type-Options: nosniff` - Prevents MIME type sniffing
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-XSS-Protection: 1; mode=block` - XSS protection
- `Referrer-Policy: strict-origin-when-cross-origin` - Controls referrer information
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` - Restricts browser features
- `Strict-Transport-Security` (production only) - Forces HTTPS

### IP Blocking Middleware
**File:** [`src/server.ts`](../../src/server.ts)

Added global IP blocking middleware that checks incoming requests against the security settings blocklist. Requests from blocked IPs receive a `403 Forbidden` response with the block reason.

### Admin Role Verification
**File:** [`src/admin/middleware.ts`](../../src/admin/middleware.ts)

Enhanced `adminSessionMiddleware` to verify that authenticated users have the `admin` or `super_admin` role. Previously, any authenticated user could access admin routes.

### Better Auth Security Configuration
**Files:** [`src/auth.ts`](../../src/auth.ts), [`src/multi-tenant/auth-factory.ts`](../../src/multi-tenant/auth-factory.ts)

- Added `httpOnly: true` cookie option
- Added proper `secure` and `sameSite` cookie settings based on environment
- Added `minPasswordLength: 8` and `maxPasswordLength: 128` constraints
- Added `rateLimit` configuration for production environments
- Added session `updateAge` to refresh sessions every 24 hours

### Database Pool Configuration
**File:** [`src/infrastructure/db/tenant-repository.ts`](../../src/infrastructure/db/tenant-repository.ts)

Updated `PgTenantRepository` to use the centralized `POOL_CONFIG` from `env.ts` instead of hardcoded values.

---

## ✨ New Features

### Two-Factor Authentication (TOTP)
**Files:** [`src/auth.ts`](../../src/auth.ts), [`src/multi-tenant/auth-factory.ts`](../../src/multi-tenant/auth-factory.ts), [`prisma/schema.prisma`](../../prisma/schema.prisma)

Added `twoFactor` plugin from Better Auth to both the main auth instance and all tenant auth instances. Features:
- TOTP-based 2FA using authenticator apps
- 30-second OTP period, 6-digit codes
- Backup codes support
- New `two_factor` database table

**API Endpoints (via Better Auth):**
- `POST /api/auth/two-factor/enable` - Enable 2FA
- `POST /api/auth/two-factor/disable` - Disable 2FA
- `POST /api/auth/two-factor/verify-totp` - Verify TOTP code
- `GET /api/auth/two-factor/get-totp-uri` - Get TOTP URI for QR code

---

### Webhook Notification System
**File:** [`src/utils/webhook.ts`](../../src/utils/webhook.ts)

New webhook system for real-time event notifications:

**Features:**
- HMAC-SHA256 signature verification for security
- Retry logic with exponential backoff (3 attempts: 1s, 2s, 4s)
- Event filtering per webhook endpoint
- Async delivery (non-blocking)
- 10-second timeout per delivery attempt

**Supported Events:**
- `tenant.created`, `tenant.suspended`, `tenant.activated`, `tenant.deleted`
- `user.created`, `user.deleted`, `user.banned`
- `session.created`, `session.revoked`
- `ip.blocked`, `ip.unblocked`
- `security.settings_updated`
- `admin.login`, `admin.logout`

**Admin API Endpoints:**
- `GET /admin/api/webhooks` - List all webhooks
- `POST /admin/api/webhooks` - Register new webhook
- `DELETE /admin/api/webhooks/:id` - Unregister webhook

**Webhook Payload Format:**
```json
{
  "id": "uuid",
  "event": "tenant.created",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "data": { ... },
  "tenantId": "optional-tenant-id"
}
```

**Signature Verification:**
```
X-Webhook-Signature: sha256=<hmac-sha256-hex>
```

---

### Enhanced Health Check Endpoints
**File:** [`src/server.ts`](../../src/server.ts)

**`GET /healthz`** - Enhanced with:
- Connection pool health status
- Active connection metrics
- Issue detection (>90% capacity, high disconnect errors, waiting requests)
- Returns `503` when unhealthy

**`GET /tenant/:tenantId/health`** - New per-tenant health check:
- Tenant status verification
- Schema existence validation
- Active connection status
- Returns `200` when healthy, `500` on error

---

### Improved Validation Error Handling
**File:** [`src/utils/validation.ts`](../../src/utils/validation.ts)

- `validateInput()` now throws `ValidationError` (AppError subclass) instead of plain `Error`
- Added `safeParseInput()` function that returns structured error objects instead of throwing
- Better error messages with field-level details

---

## 🔧 Improvements

### Structured Logging
**File:** [`src/multi-tenant/middleware.ts`](../../src/multi-tenant/middleware.ts)

Replaced `console.log` calls with structured Fastify logger (`request.log.debug`) for better log management and filtering.

### API Key Configuration
**Files:** [`src/auth.ts`](../../src/auth.ts), [`src/multi-tenant/auth-factory.ts`](../../src/multi-tenant/auth-factory.ts)

- Added `defaultPrefix` for API keys (global: `ak_`, per-tenant: `{tenantId}_ak_`)
- Enabled `enableMetadata` for API key metadata support

### JWT Configuration
**Files:** [`src/auth.ts`](../../src/auth.ts), [`src/multi-tenant/auth-factory.ts`](../../src/multi-tenant/auth-factory.ts)

- Explicitly configured RS256 algorithm for JWT signing
- Consistent JWKS configuration

### Connection Pool Configuration
**File:** [`src/multi-tenant/connection-manager.ts`](../../src/multi-tenant/connection-manager.ts)

Updated to use `POOL_MAX` and `POOL_IDLE_TIMEOUT_MS` environment variables for configurable pool settings.

---

## 📋 Database Schema Changes

### New Table: `two_factor`
```sql
CREATE TABLE two_factor (
  id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  backup_codes TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
```

Run `npx prisma migrate dev` to apply this migration.

---

## 🔑 Environment Variables

No new required environment variables. Optional additions:
- `POOL_MAX` - Override connection pool max connections
- `POOL_IDLE_TIMEOUT_MS` - Override pool idle timeout

---

## 📝 API Changes

### Admin API - New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/api/webhooks` | List registered webhooks |
| POST | `/admin/api/webhooks` | Register new webhook |
| DELETE | `/admin/api/webhooks/:id` | Unregister webhook |

### New Health Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Enhanced system health check |
| GET | `/tenant/:tenantId/health` | Per-tenant health check |

### Better Auth 2FA Endpoints (via plugin)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/two-factor/enable` | Enable 2FA for user |
| POST | `/api/auth/two-factor/disable` | Disable 2FA for user |
| POST | `/api/auth/two-factor/verify-totp` | Verify TOTP code |
| GET | `/api/auth/two-factor/get-totp-uri` | Get TOTP URI |

---

## ⚠️ Breaking Changes

None. All changes are backward compatible.

---

## 🧪 Testing

Run TypeScript compilation check:
```bash
npx tsc --noEmit
```

Run smoke tests:
```bash
npm run smoke:signup
npm run smoke:signin
npm run smoke:session
```
