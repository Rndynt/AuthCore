# Replit/Codex Prompt — P06 Legacy `src/` Decomposition & Wrapper Retirement

Repository:

```txt
Rndynt/Realmio
```

Branch:

```txt
multi-tenant
```

Context:

P05 commit:

```txt
8d4bda0d9214a344a233dff8fa04b3e8b0354799
chore: align production deployment runtime
```

P01–P05 established the target architecture and aligned production runtime:

```txt
apps/api                  composition root
packages/core             domain/use cases/ports
packages/adapters-*       infrastructure implementations
packages/http             fetch-style handlers
packages/server-fastify   Fastify runtime
packages/server-netlify   Netlify wrappers
packages/sdk              public SDK
```

However, P04/P05 still leave a large amount of active implementation in the legacy root `src/` tree. Several new adapters still wrap or import old modules from:

```txt
src/admin/*
src/application/*
src/multi-tenant/*
src/utils/*
src/env.ts
src/config/*
```

P06 must retire the legacy runtime modules safely. This is not a cosmetic move. The goal is to make `packages/*` own the runtime implementation, then delete or quarantine obsolete `src/` modules.

## Non-Negotiable Rules

1. Do not break API compatibility from P03/P04/P05.
2. Do not change route contracts.
3. Do not introduce a new framework.
4. Do not add a second Admin UI runtime.
5. Do not delete a legacy file until search/tests prove it is unused or replaced.
6. Keep `src/server.ts` only as a tiny compatibility shim if needed.
7. Prefer moving implementation into packages over leaving wrapper adapters around legacy files.
8. All changes must pass check/test/build.

## Current Problem

The refactor is structurally correct but not complete because adapters still depend on legacy implementations.

Examples to audit and migrate:

```txt
src/admin/auth.ts
src/admin/admin-api.ts
src/admin/routes.ts
src/application/tenant-service.ts
src/multi-tenant/auth-factory.ts
src/multi-tenant/connection-manager.ts
src/multi-tenant/middleware.ts
src/utils/log-stream.ts
src/utils/metrics-store.ts
src/utils/webhook.ts
src/utils/ip-utils.ts
src/env.ts
src/config/auth-mode.ts
src/config/features.ts
```

Some of these may already be unused after P05. If so, delete them. If still used, move the implementation into the appropriate package and update imports.

## Target End State

After P06:

```txt
packages/adapters-better-auth
  owns Better Auth admin provider implementation
  owns tenant auth factory/cache implementation
  must not import src/admin/* or src/multi-tenant/auth-factory.ts

packages/adapters-runtime
  owns tenant registry/connection manager implementation
  owns log stream implementation
  owns metrics store implementation
  owns webhook registry/publisher implementation
  owns IP utility adapter implementation if needed
  must not import src/multi-tenant/* or src/utils/*

apps/api/src/config.ts or packages/config
  owns typed runtime config loading
  should not require src/env.ts long term

packages/http
  remains transport/application handler layer
  must not import legacy src modules

src/
  contains no active business/runtime implementation
  may contain only explicitly documented compatibility shims, or be deleted if safe
```

## Required Implementation

### 1. Run a legacy import audit

Search the entire repository for imports/references to:

```txt
src/admin
src/application
src/multi-tenant
src/utils/log-stream
src/utils/metrics-store
src/utils/webhook
src/utils/ip-utils
src/env
src/config
../src/
../../src/
../../../src/
```

Create/update report section with the exact audit matrix:

```txt
Legacy module | Current importers | Replacement package | Action taken | Remaining status
```

### 2. Move Better Auth runtime ownership into `packages/adapters-better-auth`

Current adapter files must stop wrapping legacy admin/tenant auth modules directly.

Required:

- Move admin Better Auth instance creation/config into `packages/adapters-better-auth`.
- Move tenant Better Auth factory/cache into `packages/adapters-better-auth`.
- Preserve public behavior:

```txt
/admin/auth/*
/api/auth/*
/tenant/:tenantId/api/auth/*
/legacy/auth/*
```

- Preserve plugin configuration:

```txt
admin
organization
apiKey
jwt
bearer
twoFactor if currently enabled
```

- Preserve cookie/security behavior.
- Preserve tenant-specific Prisma/client behavior.
- Keep cache clearing/stats through the `AuthCache` port.

Forbidden after migration:

```txt
packages/adapters-better-auth importing src/admin/auth.ts
packages/adapters-better-auth importing src/multi-tenant/auth-factory.ts
```

### 3. Move tenant registry/connection runtime into `packages/adapters-runtime`

Current `packages/adapters-runtime/src/tenant-registry-adapter.ts` and connection adapter must stop wrapping legacy `src/multi-tenant/connection-manager.ts` as the primary implementation.

Required:

- Move `TenantConnectionManager` implementation into `packages/adapters-runtime`.
- Preserve tenant registry loading, active/suspended/deleted handling, connection/client cache, LRU/prune behavior, and shutdown behavior.
- Preserve serverless-safe behavior if currently implemented.
- Preserve health/stats surface used by `HealthHandler` and metrics use cases.

Forbidden after migration:

```txt
packages/adapters-runtime importing src/multi-tenant/connection-manager.ts
packages/server-fastify importing src/multi-tenant/*
apps/api importing src/multi-tenant/*
```

### 4. Move runtime utilities into `packages/adapters-runtime`

Move or reimplement these so packages do not depend on legacy `src/utils/*`:

```txt
log-stream
metrics-store
webhook registry/publisher
ip-utils
```

Required:

- `LogStreamAdapter` must use package-owned log stream implementation.
- `MetricsStoreAdapter` must use package-owned metrics store implementation.
- `WebhookEventPublisher` must use package-owned webhook registry/sender implementation.
- IP block utilities must live in packages, not `src/utils/ip-utils.ts`.

Forbidden after migration:

```txt
packages/adapters-runtime importing src/utils/log-stream.ts
packages/adapters-runtime importing src/utils/metrics-store.ts
packages/adapters-runtime importing src/utils/webhook.ts
apps/api importing src/utils/ip-utils.ts
```

### 5. Remove or quarantine `src/application/tenant-service.ts`

This file should no longer be active after the use-case migration.

Required:

- Search for all imports.
- If unused, delete it.
- If still used, replace consumers with core use cases or HTTP handler facade.
- Do not leave duplicate tenant lifecycle logic.

### 6. Review `src/admin/admin-api.ts` and `src/admin/routes.ts`

P02/P03 rewrote `packages/http/src/admin-api-handler.ts` and Fastify route registration.

Required:

- Search if these old files are still used.
- If unused, delete them.
- If used only by old Netlify or tests, migrate those consumers to packages.
- Do not keep duplicate admin routing logic.

### 7. Config migration plan

Do not leave config half-migrated.

Either:

Option A — move config now:

```txt
packages/config/src/env.ts
packages/config/src/auth-mode.ts
packages/config/src/features.ts
apps/api/src/config.ts imports from packages/config
```

or Option B — explicitly defer config to P07 with a documented boundary exception.

If choosing Option B, update architecture boundary tests so only `apps/api/src/config.ts` may import `src/env.ts` / `src/config/*`, and no other package may do so.

Preferred: Option A if feasible.

### 8. Strengthen architecture boundary tests

Update:

```txt
tests/architecture-boundaries.test.ts
```

Add rules:

```txt
packages/adapters-better-auth must not import src/admin/* or src/multi-tenant/*
packages/adapters-runtime must not import src/multi-tenant/* or src/utils/*
apps/api/src/container.ts must not import src/utils/ip-utils.ts
packages/http must not import any legacy src/*
netlify/functions must not import any legacy src/* directly
src/application/tenant-service.ts must not exist OR must not be imported anywhere
src/admin/admin-api.ts and src/admin/routes.ts must not be imported anywhere if kept as deprecated files
```

If a legacy exception remains, it must be explicit and narrowly scoped in the test with a comment explaining why.

### 9. Update deletion safety tests

Add a lightweight test:

```txt
tests/legacy-src-imports.test.ts
```

Use `node:test` and `node:assert/strict`.

It should scan repository `.ts` files and fail on forbidden legacy import paths.

Do not scan generated `dist`, `.next`, `node_modules`, `admin-ui/out`, or lockfiles.

### 10. Update report

Update:

```txt
docs/clean-architecture-refactor-report.md
```

Add section:

```txt
Phase 6 (P06) — Legacy src Decomposition & Wrapper Retirement
```

Required content:

```txt
- legacy import audit matrix
- modules moved into packages/adapters-better-auth
- modules moved into packages/adapters-runtime
- modules deleted from src
- remaining src files and why they remain
- boundary test additions
- command results:
  npm run check
  npm test
  npm run build
  npm run smoke:prod if runtime available
- remaining limitations
```

## Verification Commands

Run:

```txt
npm run check
npm test
npm run build
npm --prefix admin-ui run build
```

If Docker is available:

```txt
npm run docker:build
docker run --rm -p 5000:5000 --env-file .env realmio:local
BASE_URL=http://localhost:5000 npm run smoke:prod
```

If Docker is not available, document the blocker exactly in the report.

## Acceptance Criteria

P06 is complete only if all are true:

1. `packages/adapters-better-auth` no longer imports `src/admin/*` or `src/multi-tenant/auth-factory.ts`.
2. `packages/adapters-runtime` no longer imports `src/multi-tenant/*` or `src/utils/*`.
3. `apps/api/src/container.ts` no longer imports `src/utils/ip-utils.ts`.
4. `packages/http` imports no legacy `src/*` modules.
5. `netlify/functions` imports no legacy `src/*` modules directly.
6. `src/application/tenant-service.ts` is deleted or proven unused and quarantined.
7. `src/admin/admin-api.ts` and `src/admin/routes.ts` are deleted or proven unused and quarantined.
8. Architecture boundary tests enforce the new rules.
9. Legacy import scan test exists and passes.
10. No duplicate tenant lifecycle logic remains active.
11. Auth/admin/tenant routes from P03 still work.
12. Static Admin UI from P04/P05 still works.
13. `npm run check` passes.
14. `npm test` passes.
15. `npm run build` passes.
16. Report is updated honestly.

## Commit Required

Commit all changes with:

```txt
refactor: retire legacy src runtime modules
```
