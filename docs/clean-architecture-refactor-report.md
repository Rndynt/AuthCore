# Realmio Clean Architecture Refactor Report

## Overview

This document tracks the two-phase hexagonal architecture migration of Realmio's auth service.

---

## Phase 1 (P01) — Scaffold Packages Layer ✅

**Goal:** Extract domain logic, use cases, and port interfaces into standalone packages without breaking the existing runtime.

### Packages Introduced

| Package | Role |
|---|---|
| `packages/core` | Domain entities, port interfaces, use cases |
| `packages/adapters-postgres` | `TenantRepository`, `TenantSchemaProvisioner`, `AuditLogRepository`, `SecuritySettingsRepository` |
| `packages/adapters-better-auth` | `AdminAuthProvider`, `TenantAuthProvider` adapters |
| `packages/adapters-runtime` | `TenantRegistry`, `TenantClientProvider`, `AuthCache`, `LogStream`, `MetricsStore`, `EventPublisher` adapters |
| `packages/http` | Web Fetch API-style HTTP handlers |
| `packages/server-fastify` | Fastify app factory + middleware + routes |
| `packages/server-netlify` | Netlify Function adapters |
| `packages/sdk` | Public JavaScript/TypeScript SDK |
| `apps/api` | Composition root (`main.ts`, `container.ts`, `config.ts`) |

### P01 Status
All packages were scaffolded. Many files contained shim bodies (re-exports from `src/`) that deferred real implementation to P02.

---

## Phase 2 (P02) — Wire Real Adapters ✅

**Goal:** Replace all shims with real implementations. The composition root must boot from `apps/api/src/main.ts` without touching `src/server.ts` business logic.

### Changes per File

#### `packages/core/src/ports/tenant-repository.ts`
- Added `createProvisioningTenant` and `markTenantActive` methods.
- `createTenant` kept as a backward-compatible alias.
- This breaks the anti-pattern where `PgTenantRepository.createTenant` internally called `PgTenantSchemaProvisioner`.

#### `packages/core/src/application/tenant/tenant-use-cases.ts`
- `CreateTenantUseCase` now receives `TenantSchemaProvisioner` via `TenantLifecycleDeps`.
- Two-step lifecycle: `createProvisioningTenant` → `provisionTenantSchema` → `markTenantActive`.
- All use-case class bodies expanded from one-liners to readable implementations.
- `SuspendTenantUseCase`, `ActivateTenantUseCase`, `DeleteTenantUseCase` share `applyLifecycleTransition` helper to eliminate duplication.

#### `packages/adapters-postgres/src/pg-tenant-repository.ts`
- Removed internal call to `PgTenantSchemaProvisioner` from `createTenant`.
- Added `createProvisioningTenant` (inserts row in `provisioning` status).
- Added `markTenantActive` (flips row to `active`, stamps `provisioned_at` in metadata).
- `ensureStatusConstraint` is now a private repository concern (adds `provisioning` + `failed` to the check constraint if absent).

#### `packages/adapters-better-auth/src/better-auth-admin-provider.ts`
- Changed from a bare `export { adminAuth as betterAuthAdminProvider }` re-export to a real `BetterAuthAdminProvider` class implementing `AdminAuthProvider`.

#### `packages/adapters-better-auth/src/better-auth-tenant-provider.ts`
- `BetterAuthTenantProvider` now properly implements `TenantAuthProvider` port (`getTenantAuth` method).

#### `packages/adapters-runtime/src/tenant-registry-adapter.ts`
- `TenantRegistryAdapter` class implements `TenantRegistry` port fully.
- Maps `TenantConnectionManager`'s snake_case rows to camelCase `Tenant` domain objects.

#### `packages/adapters-runtime/src/tenant-connection-manager.ts`
- `TenantConnectionManagerAdapter` implements `TenantClientProvider`.
- Exposes `pruneIdleConnectionsNow`, `shutdown`, `getHealthStatus`, `getStats`.

#### `packages/adapters-runtime/src/auth-cache-adapter.ts`
- `BetterAuthCacheAdapter` implements `AuthCache` with `clearTenant` / `clearAll` / `getStats`.

#### `packages/adapters-runtime/src/log-stream-adapter.ts`
- Properly wraps `addLogListener` / `removeLogListener` from `src/utils/log-stream`.

#### `packages/http/src/admin-api-handler.ts`
- **Fully rewritten** — no longer re-exports from `src/admin/admin-api`.
- `createAdminHandler(deps)` factory accepts `AdminHandlerUseCases` (port-aligned interface).
- `handleAdminApiRequest` dispatches to all admin API routes via URL pattern matching.
- `handleAdminLogStream` implements SSE using the `LogStream` port.
- All audit logging is done inline by calling `useCases.audit.log`.

#### `apps/api/src/config.ts`
- New typed `AppConfig` interface with `loadAppConfig()` factory.
- Pulls from `src/env`, `src/config/auth-mode`, `src/config/features`.

#### `apps/api/src/container.ts`
- **Fully rewritten** real composition root.
- Instantiates all adapters, all use cases, and the HTTP handler facades.
- Returns a typed `AppContainer` with no references to `src/` business objects.

#### `apps/api/src/main.ts`
- **Fully rewritten** bootstrap:
  1. `loadAppConfig()` → `createAppContainer()` → `tenantRegistry.initialize()`
  2. `createFastifyApp(container)` → `app.listen()`
  3. Graceful `SIGTERM`/`SIGINT` shutdown.

#### `packages/server-fastify/src/create-fastify-app.ts`
- **Fully rewritten** real Fastify factory.
- Registers CORS, body parser, middleware, routes — all from `packages/` layer.
- No `src/` imports.

#### `packages/server-fastify/src/middleware/`
- `request-id.ts` — attaches UUID `X-Request-ID`.
- `security-headers.ts` — `X-Content-Type-Options`, `X-Frame-Options`, etc.
- `rate-limit.ts` — in-process sliding-window limiter per IP.
- `ip-blocking.ts` — calls `CheckIpBlockedUseCase` before every request.

#### `packages/server-fastify/src/routes/`
- `admin.routes.ts` — all `/admin/*` routes with Fastify ↔ Web Request bridge.
- `tenant-auth.routes.ts` — all `/api/auth/:tenantSlug/*` routes.
- `health.routes.ts` — `/health`, `/ready`, `/api/health`.
- `dev.routes.ts` — `/dev/*` endpoints (only when `devEnabled`).
- `static-ui.routes.ts` — SPA catch-all for admin UI.

#### `packages/server-netlify/src/`
- `netlify-request-mapper.ts` — `HandlerEvent` → `Request` (handles base64 bodies).
- `netlify-response-mapper.ts` — `Response` → `HandlerResponse` (base64 encoded).
- `admin-auth-function.ts` — real handler using `AppContainer`.
- `tenant-auth-function.ts` — real handler using `AppContainer`.

#### `netlify/functions/admin-auth.ts` / `tenant-auth.ts`
- Reduced to thin bootstrap wrappers (~20 lines each).
- Container is created once on cold start and reused on warm invocations.

#### `packages/sdk/package.json`
- Added with `name`, `version`, `exports`, `files`, `license`.

#### `packages/sdk/src/admin/`
- `tenants-resource.ts`, `security-resource.ts`, `audit-resource.ts`, `metrics-resource.ts`, `users-resource.ts`, `webhooks-resource.ts`, `support-sessions-resource.ts`.
- All resources are typed and attached to `RealmioAdminClient` as lazy properties.

#### `packages/sdk/src/realmio-admin-client.ts`
- Replaced the stub with a real typed HTTP client with a resource-per-concern pattern.

#### `src/server.ts`
- Reduced from 639 lines to a ~15-line compatibility shim that re-exports from the new layers.

### Architecture Boundary Tests

`tests/architecture-boundaries.test.ts` enforces seven rules:

1. `packages/core` — no `src/` or adapter imports.
2. `packages/http` — no `src/` or adapter imports.
3. `netlify/functions` — no direct `src/` application imports.
4. `packages/server-fastify` — no `src/` business-logic imports.
5. `apps/api/src/container.ts` — uses only packages layer.
6. Use-case files — no adapter class imports.
7. `packages/sdk` — no adapter or `src/` imports.

---

## Dependency Graph (P02)

```
apps/api/src/main.ts
  └── apps/api/src/container.ts
        ├── packages/adapters-postgres/*
        ├── packages/adapters-better-auth/*
        ├── packages/adapters-runtime/*
        ├── packages/core/src/application/**/* (use cases)
        └── packages/http/src/*

packages/server-fastify/src/create-fastify-app.ts
  ├── packages/server-fastify/src/middleware/*
  ├── packages/server-fastify/src/routes/*
  └── [AppContainer type from apps/api/src/container]

netlify/functions/*
  ├── apps/api/src/config + container
  └── packages/server-netlify/src/*

packages/adapters-*
  ├── packages/core/src/ports/*      (implement interfaces)
  └── src/*                          (wrap — not re-export)

packages/core
  └── (no external deps)
```

---

## What Remains in `src/`

`src/` is **not deleted** — it contains working implementations that the adapter packages wrap. It will be removed incrementally in P03+ once each module has been fully superseded.

Modules still in active use via adapter wrappers:
- `src/admin/auth.ts` — Better Auth admin instance
- `src/multi-tenant/auth-factory.ts` — per-tenant auth instance cache
- `src/multi-tenant/connection-manager.ts` — TenantConnectionManager
- `src/utils/log-stream.ts`, `metrics-store.ts`, `webhook.ts` — runtime utilities
- `src/env.ts`, `src/config/` — environment + feature flags
