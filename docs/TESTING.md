# Testing Guide

Use this guide to confirm that AuthCore is configured correctly after installation and provisioning.
Each section focuses on a specific surface: admin authentication, tenant authentication, and
multi-tenant isolation.

> **Prerequisites**
>
> - The server is running (`npm run dev`).
> - `DATABASE_URL` points to the database you provisioned.
> - You have seeded the root admin via `npx tsx scripts/seed-admin.ts`.
> - `curl` and `jq` are installed locally.

## 1. Admin Authentication

### 1.1 Sign In

```bash
curl -i \
  -c admin-cookie.txt \
  -b admin-cookie.txt \
  -X POST http://localhost:5000/admin/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  --data '{"email":"root@authcore.local","password":"AuthCore123!"}'
```

Expected outcome:

- HTTP `200` response.
- `Set-Cookie: authcore_admin_session=...` header present.
- Response body includes the admin user object.

If you receive `401` ensure the seed script ran against the same database as the server.

### 1.2 Session Verification

```bash
curl -i \
  -c admin-cookie.txt \
  -b admin-cookie.txt \
  http://localhost:5000/admin/auth/get-session
```

Expected outcome: JSON payload with `session` and `user` objects. This confirms cookies are signed
with the configured `BETTER_AUTH_SECRET`.

### 1.3 Admin APIs

With a valid admin session you can call dashboard endpoints:

```bash
curl -s \
  -c admin-cookie.txt \
  -b admin-cookie.txt \
  http://localhost:5000/admin/api/tenants | jq
```

The response lists tenants known to the registry. Use this command to verify new tenants appear after
provisioning.

## 2. Tenant Authentication (Single Mode)

Run this section only if `AUTH_MODE=single`.

```bash
# Sign up
curl -i \
  -c tenant-cookie.txt \
  -b tenant-cookie.txt \
  -X POST http://localhost:5000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  --data '{"email":"single@example.com","password":"Passw0rd!","name":"Single Tenant"}'

# Sign in
curl -i \
  -c tenant-cookie.txt \
  -b tenant-cookie.txt \
  -X POST http://localhost:5000/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  --data '{"email":"single@example.com","password":"Passw0rd!"}'

# Session check
curl -s \
  -c tenant-cookie.txt \
  -b tenant-cookie.txt \
  http://localhost:5000/api/auth/get-session | jq
```

A successful session response confirms the fixed schema defined by `TENANT_SCHEMA` is active.

## 3. Tenant Authentication (Multi/Hybrid Mode)

These tests rely on the `X-Tenant-Id` header to pick a tenant. Replace `pos` with a tenant slug
present in `public.tenants`.

```bash
TENANT_ID=pos

# Sign up a tenant user
curl -i \
  -c ${TENANT_ID}-cookie.txt \
  -b ${TENANT_ID}-cookie.txt \
  -X POST http://localhost:5000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -H "X-Tenant-Id: ${TENANT_ID}" \
  --data '{"email":"tenant-${TENANT_ID}@example.com","password":"Passw0rd!","name":"Tenant User"}'

# Sign in
curl -i \
  -c ${TENANT_ID}-cookie.txt \
  -b ${TENANT_ID}-cookie.txt \
  -X POST http://localhost:5000/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -H "X-Tenant-Id: ${TENANT_ID}" \
  --data '{"email":"tenant-${TENANT_ID}@example.com","password":"Passw0rd!"}'

# Resolve session with tenant context
curl -s \
  -c ${TENANT_ID}-cookie.txt \
  -b ${TENANT_ID}-cookie.txt \
  -H "X-Tenant-Id: ${TENANT_ID}" \
  http://localhost:5000/me | jq
```

Expected outcome:

- The `/me` payload contains `tenant.id` and `tenant.slug` fields.
- Requests without the header return `401` with `{ "error": "tenant_required" }` (handled by
  `tenantMiddleware`).

## 4. Isolation Checks

Confirm that users are written to the correct schemas:

```bash
# Replace with your tenant schemas
psql $DATABASE_URL -c "SELECT COUNT(*) FROM authcore_system.users;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM tenant_pos.users;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM tenant_crypto.users;"
```

Counts should only increment for the tenant you interacted with. If admin users appear in `public`
re-run `npx tsx scripts/seed-admin.ts` and verify the admin Prisma client configuration.

## 5. Optional: Nested Tenancy

When `NESTED_TENANCY_ENABLED=true`, confirm sub-tenant data is available:

```bash
curl -s \
  -c admin-cookie.txt \
  -b admin-cookie.txt \
  http://localhost:5000/admin/sub-tenants/<applicationId> | jq
```

Replace `<applicationId>` with an ID from `public.applications`. The response lists sub-tenants cached
by `SubTenantManager`.

Successful completion of these checks validates admin access, tenant flows, and schema isolation for
your chosen deployment mode.
