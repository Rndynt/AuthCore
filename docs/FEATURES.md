# Realmio Feature Overview

Realmio is a multi-schema authentication platform designed for SaaS products that need to mix
centralized administration with tenant-specific identity. The implementation is split into two
isolated authentication surfaces—**admin** and **tenant**—that run on top of PostgreSQL schemas.

## Architecture Highlights

| Layer | Description | Key Artifacts |
|-------|-------------|---------------|
| Admin authentication | Better Auth instance dedicated to platform operators with its own Prisma client and schema. | `src/admin/auth.ts`, `scripts/setup-admin-schema.sql` |
| Tenant authentication | Dynamic Better Auth factories that attach to tenant schemas resolved by middleware. | `src/multi-tenant/auth-factory.ts`, `src/multi-tenant/middleware.ts` |
| Schema management | SQL templates and managers that create and cache tenant schemas at runtime. | `src/multi-tenant/provision-schemas.ts`, `src/multi-tenant/connection-manager.ts` |
| API gateway | Fastify server that routes requests to the proper auth surface based on mode and headers. | `src/server.ts` |
| Configuration core | Feature toggles that pick between single-tenant, flat multi-tenant, and nested tenancy. | `src/config/auth-mode.ts`, `src/config/features.ts` |

## Supported Deployment Modes

Realmio can be operated in three modes selected through environment variables:

1. **Single** – Dedicated to one tenant or application with a fixed schema (`AUTH_MODE=single`).
2. **Multi** – Shared environment where tenants are looked up from the registry (`AUTH_MODE=multi`).
3. **Hybrid** – Multi-tenant with optional nested sub-tenancy (`AUTH_MODE=multi`, `NESTED_TENANCY_ENABLED=true`).

See [INSTALLATION.md](./INSTALLATION.md) and [CONFIGURATION.md](./CONFIGURATION.md) for step-by-step
setup details for each mode.

## Authentication Surfaces

### Admin Surface

- Uses the `authcore_system` schema and its own `PrismaClient` instance.
- Routes are namespaced under `/admin/auth/*` and `/admin/api/*`.
- Protects dashboard APIs via `adminAuthMiddleware` and the Better Auth admin plugin.
- Seeded with a root account through `scripts/seed-admin.ts`.
- Disabled in single-tenant mode because the tenant registry and admin management APIs are not
  initialized when `AUTH_MODE=single`.

### Tenant Surface

- Tenant resolution happens in `tenantMiddleware`, which reads the `X-Tenant-Id` header, subdomains,
  or `/tenant/{tenantId}` paths.
- Each tenant uses an isolated schema (`tenant_<slug>`), automatically provisioned when needed.
- Supports nested sub-tenants when the feature flag is enabled.
- Provides helper routes such as `/tenant/info` and `/me` for tenant-aware session introspection.

## Database Footprint

- **`authcore_system`** – Admin users, sessions, and credential accounts.
- **`public`** – Tenant registry tables (`tenants`, `applications`, `tenant_audit_log`).
- **`tenant_*` schemas** – Per-tenant Better Auth tables plus optional nested resources.

Provisioning scripts in `scripts/` create these schemas and tables for each deployment scenario. The
[`PROVISIONING.md`](./PROVISIONING.md) document explains how to run them.

## Tooling & Developer Experience

- **TypeScript-first** with strict config and `npm run check` for type validation.
- **Prisma** client generation (`npm run prisma:gen`) for both admin and tenant surfaces.
- **Better Auth CLI** integration for regenerating adapters (`npm run better-auth:gen`).
- **Smoke tests** for core flows (`npm run smoke:signup`, `npm run smoke:signin`, etc.).
- **Seed scripts** for root admin bootstrap (`npx tsx scripts/seed-admin.ts`).

## Dashboard & API Surfaces

| Route | Purpose | Protection |
|-------|---------|------------|
| `/admin/auth/*` | Admin authentication endpoints (sign-in, sign-up, session). | Uses `adminAuth` (Better Auth admin instance). |
| `/admin/api/*` | Admin dashboard APIs (tenant management, stats). | Guarded by `adminAuthMiddleware`. |
| `/api/auth/*` | Tenant authentication in multi or single mode. | Resolved by `auth` or tenant-specific handler. |
| `/tenant/:tenantId/api/auth/*` | Tenant authentication with tenant ID in the path. | Uses tenant middleware to resolve the tenant. |
| `/me` | Returns current tenant session context. | Tenant middleware required in multi mode. |
| `/legacy/auth/*` | Deprecated legacy route (use `/api/auth/*`). Removal scheduled after 2025-06-30. | Shares the same auth handler as `/api/auth/*` and emits deprecation headers. |

## Feature Flags

Feature toggles are derived from configuration and exposed through `getFeatureFlags`:

- `nestedTenancy` – Enables nested sub-tenant managers and routes.
- `adminConsole` – Powers the admin dashboard APIs.
- `developmentEndpoints` – Activates `/dev/*` utilities when `ENABLE_DEV_ENDPOINTS=true`.

Consult [CONFIGURATION.md](./CONFIGURATION.md) for the definitive list of environment variables and
how they activate each capability.
