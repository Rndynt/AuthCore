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

---

## Phase 3 (P03) — Compile, Test, and API Compatibility Fixes ✅

### Summary of Issues Fixed

| # | File | Issue | Fix |
|---|---|---|---|
| 1 | `packages/server-fastify/src/create-fastify-app.ts` | Wrong `../../apps/api/src/container` path | Corrected to `../../../apps/api/src/container.js` |
| 2 | `packages/server-fastify/src/routes/*.ts` | Wrong `../../../apps/api/src/container.js` (3 levels, not 4) | Corrected to `../../../../apps/api/src/container.js` |
| 3 | `packages/server-netlify/src/*.ts` | Wrong `../../apps/api/src/container` path | Corrected to `../../../apps/api/src/container.js` |
| 4 | `create-fastify-app.ts` | `@fastify/formbody` missing from deps; dynamic import passed to register | Removed; using proper `import cors from '@fastify/cors'` style |
| 5 | `tenant-auth.routes.ts` | Wrong route pattern `/api/auth/:tenantSlug/*`; wrong `handle(slug, req)` arg order | New routes: `/api/auth/*`, `/tenant/:tenantId/api/auth/*`, `/legacy/auth/*` |
| 6 | `admin.routes.ts` | Missing `/admin/api` (no wildcard) route | Added explicit `app.all('/admin/api', ...)` alongside wildcard |
| 7 | `architecture-boundaries.test.ts` | Imported `vitest` (not installed) | Converted to `node:test` + `node:assert/strict` |
| 8 | `architecture-boundaries.test.ts` | Rule 4 incorrectly banned `packages/core/src` imports | Added `isMonolithSrcImport()` helper to distinguish legacy `src/` from `packages/core/src` |
| 9 | `tests/tenant-use-cases.test.ts` | Missing `tenantSchemaProvisioner`, `createProvisioningTenant`, `markTenantActive` in fake deps | Full fake repo/provisioner updated |
| 10 | `create-fastify-app.ts` CORS | Missing `X-Tenant-Id`, `x-api-key`, `X-Requested-With` allowed headers | Restored full header list |
| 11 | `apps/api/src/config.ts` | `env.HOST` doesn't exist; `getFeatureFlags()` needs `AuthConfig` arg | Use `process.env.HOST`; pass `authConfig` to `getFeatureFlags` |
| 12 | `apps/api/src/container.ts` | `isIpInBlocklist` return type doesn't match `IpBlockEntry` domain type | Cast via inline wrapper |
| 13 | `netlify/functions/*.ts` | `handler` variable redeclared; return type `void \| Promise` mismatch | Rename to `_handler`; use promise chain without `async` |
| 14 | `packages/adapters-runtime/src/log-stream-adapter.ts` | `addListener`/`removeListener` names wrong | Use `addLogListener`/`removeLogListener` |
| 15 | `packages/server-netlify/src/tenant-auth-function.ts` | `handle(tenantSlug, webRequest)` — wrong arg order | Fixed to `handle(webRequest, options?)` |
| 16 | `packages/sdk/src/index.ts` | Missing `RealmioApiError` export | Added class + export |
| 17 | `packages/sdk/src/realmio-admin-client.ts` | No injectable `fetch`/`credentials`; no error class | Added `fetch`, `credentials` options; throws `RealmioApiError` |
| 18 | `packages/sdk/src/realmio-tenant-auth-client.ts` | Missing `session.get()`, no injectable fetch | Fully rewrote with `session`, `user` resource objects |
| 19 | `packages/sdk/package.json` | `./tenant` export pointed to non-existent file | Fixed to `./src/realmio-tenant-auth-client.{js,ts}` |
| 20 | `tsconfig.json` | Missing `@types/node`; `baseUrl` deprecation warning | `npm install @types/node --save-dev`; added `ignoreDeprecations: "5.0"` |
| 21 | `src/application/tenant-service.ts` | Pre-existing implicit `any` in callbacks | Added explicit types |
| 22 | `health.routes.ts` + `HealthHandler` | `handle()` returned `Response`; routes compared `result.status === 'ok'` | `HealthHandler.handle(type)` now returns `HealthResult` plain object |

### Command Results

```
npm run check   → 0 errors ✅
npm test        → 24/24 pass (0 fail) ✅
npm run build   → packages + api + admin-ui all exit 0 ✅
```

### Route Compatibility Confirmation

| Route | Status |
|---|---|
| `GET /health`, `/healthz`, `/ready`, `/api/health` | ✅ |
| `ALL /admin/auth/*` | ✅ |
| `ALL /admin/api` | ✅ (explicit) |
| `ALL /admin/api/*` | ✅ (wildcard) |
| `GET /admin/log-stream` | ✅ SSE |
| `ALL /api/auth/*` | ✅ primary tenant auth |
| `ALL /tenant/:tenantId/api/auth/*` | ✅ explicit tenant prefix |
| `ALL /legacy/auth/*` | ✅ with Deprecation + Sunset headers |
| `ALL /dev/*` | ✅ (when devEnabled) |

### CORS Headers Restored

```ts
allowedHeaders: [
  'Content-Type', 'Authorization', 'X-Requested-With',
  'x-api-key', 'X-Tenant-Id', 'X-Request-Id', 'X-Request-ID'
]
```

### Remaining Limitations

- `@fastify/static` is in production deps but not yet used in dev mode (no dist/public) — placeholder page served instead
- SSE log-stream endpoint returns HTTP 501 in Netlify serverless mode (expected; SSE requires persistent connections)
- `src/application/tenant-service.ts` and other legacy `src/` modules remain; scheduled for removal in P04+

---

## Phase 4 (P04) — Docker, Admin UI Static Export, Runtime Fixes ✅

### Summary of Changes

#### `admin-ui/next.config.ts`
- Removed `output: 'standalone'` and all `rewrites()` (Next rewrites require a running Next server; incompatible with static export).
- Added `output: 'export'` — Next.js generates a fully static site in `admin-ui/out/`.
- Added `basePath: '/admin'` — all internal links and asset URLs are prefixed with `/admin`, matching the Fastify serving prefix.
- Added `trailingSlash: true` — generates `page/index.html` paths for clean URL compatibility with static file servers.
- Added `images: { unoptimized: true }` — Next Image Optimization requires a server; static export must skip it.

#### `admin-ui/lib/api-client.ts`
- Removed all `NEXT_INTERNAL_API_URL` references (was a server-side env var for rewrites).
- `resolveApiBase()` now returns `window.location.origin` in the browser and `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'` at build time.
- Fixed all SDK method call signatures: `blockIp({ ip, reason, expiresInMs })`, `audit.list(params)`, `connections.prune(force)`.
- Fixed `createSupportSession(tenantId, userId, minutes)` → wraps `minutes` in `{ minutes }` object.
- Added `auth.login/logout/getSession` via new `AdminAuthResource`.

#### `packages/sdk/src/admin/admin-auth-resource.ts`
- New `AdminAuthResource` with `getSession()`, `login(email, password)`, `logout()`.
- Routes: `GET /admin/auth/get-session`, `POST /admin/auth/sign-in/email`, `POST /admin/auth/sign-out`.

#### `packages/sdk/src/admin/connections-resource.ts`
- New `ConnectionsResource` with `prune(force?)`.
- Route: `POST /admin/api/connections/prune`.

#### `packages/sdk/src/admin/security-resource.ts`
- Made `blockedBy` optional in `CreateIpBlockInput` (resolved server-side from admin session).

#### `packages/sdk/src/admin/audit-resource.ts`
- `list()` now accepts `AuditListOptions | Record<string, unknown>` — compatible with legacy params-object callers.

#### `Dockerfile`
- `COPY --from=build /app/admin-ui/out ./admin-ui/out` → `COPY --from=build /app/admin-ui/out ./dist/public`
- Single `CMD ["node", "dist/apps/api/src/main.js"]` — Fastify serves both API and static Admin UI.
- Removed the second `admin-ui` `CMD` entirely (standalone mode removed).

#### `packages/server-fastify/src/routes/static-ui.routes.ts`
- Added `shouldServeAdminUi(pathname)` — exported helper that returns `true` only for Admin UI paths.
- In **production** with missing `dist/public/index.html`: returns HTTP 500 JSON error (never silent placeholder).
- In **development** with missing `dist/public`: returns a minimal HTML placeholder.
- In normal operation: serves `dist/public` via `@fastify/static` at `/admin` prefix.
- SPA fallback: `/admin/*` tries exact file → directory index → `index.html`.
- `GET /` redirects 302 to `/admin/`.

#### `tests/static-ui-route-guard.test.ts`
- 23 test cases covering `shouldServeAdminUi()` for every route pattern.
- All pass under `node --import tsx --test`.

#### Admin UI pages — type fixes
- `audit/page.tsx` — snake_case → camelCase (matches `AuditLogEntry` from SDK).
- `security/page.tsx`, `support-sessions/page.tsx`, `users/page.tsx`, `tenants/page.tsx`, `(dashboard)/page.tsx` — response unwrap casts via `(response as any)`.
- `tenant-details-sheet.tsx` — `response.metrics` cast via `(response as any)`.

### Route Behaviour

| Path | Behaviour |
|---|---|
| `GET /` | 302 redirect → `/admin/` |
| `GET /admin` | serves `dist/public/index.html` (dashboard SPA) |
| `GET /admin/tenants` | SPA index fallback → client router handles |
| `GET /admin/_next/static/…` | exact static asset from `dist/public` |
| `GET /admin/api/…` | `shouldServeAdminUi` returns false → 404 JSON |
| `GET /admin/auth/…` | `shouldServeAdminUi` returns false → 404 JSON |

### Static Export Output Structure

```
admin-ui/out/
├── index.html          → /admin/
├── login/index.html    → /admin/login/
├── tenants/index.html  → /admin/tenants/
├── security/index.html → /admin/security/
├── audit/index.html    → /admin/audit/
├── _next/static/…      → /admin/_next/static/…
└── 404/index.html      → /admin/404/
```

Copied verbatim to `dist/public/` by Dockerfile. The `basePath: '/admin'` in Next config ensures all internal hrefs are already prefixed — no server-side path rewriting needed.

### Command Results

```
npm run check                     → 0 errors ✅
npm test                          → 47/47 pass (0 fail) ✅
npm --prefix admin-ui run build   → 11/11 static pages ✅
```

---

## Phase 5 (P05) — Production Runtime Smoke & Deploy Alignment ✅

### Summary of Changes

#### `docker-compose.yml`
- Replaced two-service model (`api` on port 4000 + `admin-ui` on port 3000) with a **single `api` service** on port 5000.
- Removed `admin-ui` service entirely.
- Removed `NEXT_INTERNAL_API_URL` environment variable.
- Removed port `3000:3000` mapping.
- Removed reference to `admin-ui/Dockerfile`.
- Updated healthcheck from port 4000 → port 5000 at `/healthz`.
- Added explicit `NODE_ENV: production` and `PORT: 5000` environment entries.

#### `docs/DEPLOY_VPS_DOCKER.md`
- Full rewrite for P04 Option A architecture (single Fastify container).
- Removed all references to standalone Next.js output, `admin-ui/Dockerfile`, `NEXT_INTERNAL_API_URL`, separate admin-ui service on port 3000, and old port 4000 API.
- Added complete route map table.
- Added Coolify deployment instructions (single service, port 5000, `/healthz` health check).
- Nginx config updated to single upstream (all traffic → port 5000).
- Added smoke test instructions.

#### `scripts/smoke-production-runtime.sh`
- New executable shell script using only `curl` + `grep`/`sed` (no `jq` required).
- Configurable via `BASE_URL` (default `http://localhost:5000`).
- Checks 12 endpoints:
  - `/healthz` — expect 200
  - `/ready` — expect 200 or 503 with JSON
  - `/api/health` — health alias
  - `/` — expect 302 or 200
  - `/admin/` — expect 200 HTML
  - `/admin/_next/static/…` — discovered from index.html, expect 200
  - `/admin/api` — expect JSON, NOT HTML
  - `/admin/api/tenants` — expect JSON, NOT HTML
  - `/admin/auth/get-session` — expect JSON, NOT HTML
  - `/api/auth/get-session` — expect JSON
  - `/tenant/__missing__/api/auth/get-session` — expect JSON
  - `/legacy/auth/get-session` — expect JSON + checks Deprecation header
- Exits with code 1 if any check fails.

#### `package.json`
- Added `smoke:prod`: `bash scripts/smoke-production-runtime.sh`
- Added `docker:build`: `docker build -t realmio:local .`

#### `tests/deployment-config.test.ts`
- 17 invariant tests reading Dockerfile, `docker-compose.yml`, `admin-ui/next.config.ts`, and `docs/DEPLOY_VPS_DOCKER.md` as plain text.
- Guards against regression to old two-service model.

### Command Results

```
npm run check                     → 0 errors ✅
npm test                          → 64/64 pass (0 fail) ✅
npm run build                     → API + Admin UI 11/11 static pages ✅
npm --prefix admin-ui run build   → 11/11 static pages ✅
docker build -t realmio:local .   → BLOCKED: Docker daemon not available in sandbox
```

#### Docker Build Blocker

The sandbox does not have a Docker daemon (`docker: not found`). Dockerfile was validated statically — all 11 structural checks pass:

| Check | Status |
|---|---|
| Stage 1: `FROM node:20-alpine AS deps` | ✅ |
| Dual dep install: `npm ci && npm --prefix admin-ui ci` | ✅ |
| `npx prisma generate` | ✅ |
| `npm run build` (API + admin-ui) | ✅ |
| Runtime stage: `FROM node:20-alpine AS runtime` | ✅ |
| Prod deps: `npm ci --omit=dev` | ✅ |
| API copy: `COPY --from=build /app/dist ./dist` | ✅ |
| UI copy: `admin-ui/out → dist/public` | ✅ |
| Prisma binary: `node_modules/.prisma` | ✅ |
| `EXPOSE 5000` | ✅ |
| `CMD ["node", "dist/apps/api/src/main.js"]` | ✅ |

To run Docker build and smoke test on VPS or local machine:

```bash
docker build -t realmio:local .
docker run --rm -p 5000:5000 --env-file .env realmio:local &
sleep 5
BASE_URL=http://localhost:5000 npm run smoke:prod
```

#### Smoke Test Note

`npm run smoke:prod` was not executed in the sandbox because it requires a live running server. The script has been validated for shell correctness (`bash -n`). On a VPS with a running container, run:

```bash
BASE_URL=http://localhost:5000 npm run smoke:prod
```

### Remaining Limitations

- Docker build can only be verified in an environment with Docker daemon (VPS/local machine).
- Smoke test requires a live server with a valid `DATABASE_URL` and all `BETTER_AUTH_*` env vars.
- `src/` legacy modules (`src/admin/`, `src/multi-tenant/`, `src/utils/`) are still present; scheduled for removal in P06+.
- `@fastify/static` SSE `proxy_buffering off` must be set in Nginx for the log-stream endpoint (documented in deploy guide).

---

## Phase 6 (P06) — Legacy src/ Decomposition ✅

### Summary

P06 eliminates all direct imports from the legacy `src/` monolith directories in the packages layer. Each module is now owned by a specific package; `src/` files are reduced to thin re-export shims to preserve backward compatibility for any remaining legacy callers.

### New Package: `packages/config`

| File | Purpose |
|---|---|
| `packages/config/src/env.ts` | All env-var parsing: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `PORT`, `TRUSTED_ORIGINS`, `POOL_CONFIG`, `SESSION_CONFIG`, `TENANT_CLIENT_IDLE_TTL_MS`, … |
| `packages/config/src/auth-mode.ts` | Auth mode resolution: `database`, `edge`, `netlify` |
| `packages/config/src/features.ts` | Feature-flag derivation from auth config |
| `packages/config/src/index.ts` | Barrel export |

### Modules Moved into `packages/adapters-runtime`

| New file | Original `src/` file |
|---|---|
| `tenant-connection-manager-impl.ts` | `src/multi-tenant/connection-manager.ts` |
| `types.ts` | `src/multi-tenant/types.ts` |
| `log-stream.ts` | `src/utils/log-stream.ts` |
| `metrics-store.ts` | `src/utils/metrics-store.ts` |
| `webhook.ts` | `src/utils/webhook.ts` |
| `ip-utils.ts` | `src/utils/ip-utils.ts` |

All adapters (`log-stream-adapter`, `metrics-store-adapter`, `webhook-event-publisher`, `tenant-registry-adapter`, `tenant-connection-manager`, `auth-cache-adapter`) now import from these local files.

### Modules Moved into `packages/adapters-better-auth`

| New file | Original `src/` file |
|---|---|
| `admin-auth-instance.ts` | `src/admin/auth.ts` |
| `tenant-auth-factory.ts` | `src/multi-tenant/auth-factory.ts` |

All `better-auth-*-provider.ts` and `better-auth-factory.ts` files now import from these local files.

### Files Deleted

| Deleted | Replaced by |
|---|---|
| `src/admin/admin-api.ts` | `packages/http/src/admin-api-handler.ts` |
| `src/admin/routes.ts` | `packages/server-fastify/src/routes/admin.routes.ts` |
| `src/application/tenant-service.ts` | `packages/core/src/application/tenant/*` |
| `create-tenant.ts` (root dev script) | — (dev utility, not needed) |
| `tests/admin-api.snapshot.test.ts` | — (old monolith handler, superseded) |
| `tests/__snapshots__/` | — |

### src/ Shims Remaining

All remaining `src/` files are **one-line re-export shims** (`export * from '../../packages/...'`). They exist solely for backward compatibility and will be deleted in P07.

### New Tests Added

| Test file | New rules |
|---|---|
| `tests/architecture-boundaries.test.ts` | +5 rules: R8 adapters-better-auth no src/admin, R9 adapters-runtime no src/utils, R10 config.ts uses packages/config, R11-12 deleted files must not exist |
| `tests/legacy-src-imports.test.ts` | Scans 11 directories for 5 forbidden import patterns; one test per directory |

### Command Results

```
npm run check   → 0 errors ✅
npm test        → 78/78 pass (0 fail) ✅
npm run build   → API + Admin UI 11/11 static pages ✅
```

### Test Count Growth

| Phase | Tests |
|---|---|
| P02 | 7 |
| P03 | 24 |
| P04 | 47 |
| P05 | 64 |
| **P06** | **78** |
