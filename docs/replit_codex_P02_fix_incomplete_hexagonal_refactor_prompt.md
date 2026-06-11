# Replit/Codex Prompt — P02 Fix Incomplete/Fake Hexagonal Refactor

Repository:

```txt
Rndynt/Realmio
```

Branch:

```txt
multi-tenant
```

Previous commit attempted:

```txt
refactor: introduce clean hexagonal architecture and SDK
```

The previous implementation is **not acceptable yet**. It created new folders/packages, but large parts are compatibility shims that still route back into the old runtime. This violates the P01 goal: real clean architecture, real separation of concern, real hexagonal ports/adapters, and a usable SDK.

This patch must fix the incomplete refactor. Do not add another cosmetic layer. Remove fake shims and wire the new architecture for real.

## Critical Findings To Fix

### 1. `apps/api/src/main.ts` is fake

Current file is only:

```ts
import '../../../src/server.js';
```

This is not a composition root. It keeps the old god `src/server.ts` as the actual runtime.

Required fix:

- Replace it with a real bootstrap/composition root.
- It must load config, create the app container, create the Fastify app through `packages/server-fastify`, register shutdown handlers explicitly, then listen.
- It must not import `src/server.js`.

Expected shape:

```ts
import { createAppContainer } from './container.js';
import { createFastifyApp } from '../../../packages/server-fastify/src/create-fastify-app.js';

const container = await createAppContainer();
const app = await createFastifyApp(container);
await app.listen({ host: container.config.host, port: container.config.port });
```

Exact names may differ, but the responsibility must be real.

### 2. `packages/server-fastify/src/create-fastify-app.ts` is fake

Current file imports old server:

```ts
export async function createFastifyApp(_container: unknown) {
  const mod = await import('../../../src/server.js');
  return mod;
}
```

Required fix:

- Implement a real Fastify app factory.
- Move/rebuild route registration from `src/server.ts` into `packages/server-fastify` routes and middleware.
- The Fastify package must not import `src/server.js`.
- It may import `packages/http` handlers and adapters from the container.

Required routes:

```txt
/api/auth/*
/tenant/:tenantId/api/auth/*
/admin/auth/*
/admin/api
/admin/api/*
/admin/log-stream
/legacy/auth/*
/healthz
/tenant/:tenantId/health
/dev/* behavior
static Admin UI + SPA fallback
```

### 3. `apps/api/src/container.ts` still uses old singletons

Current container imports:

```ts
src/application/tenant-service.js
src/multi-tenant/connection-manager.js
src/admin/auth.js
src/multi-tenant/auth-factory.js
src/utils/log-stream.js
src/utils/metrics-store.js
```

This means the new ports/adapters are not actually composed.

Required fix:

- Instantiate concrete adapters from `packages/adapters-postgres`, `packages/adapters-better-auth`, and `packages/adapters-runtime`.
- Instantiate core use cases from `packages/core`.
- Build `httpHandlers` from `packages/http`.
- Do not expose `tenantService` from `src/application/tenant-service.ts` as the main application service.
- Remove dependency on old `src/application/tenant-service.ts` from the new container.

Expected container shape:

```ts
export interface AppContainer {
  config: AppConfig;
  useCases: {
    tenants: { list; get; create; suspend; activate; delete; metrics; };
    security: { getSettings; updateSettings; getIpBlocklist; blockIp; unblockIp; checkIpBlocked; };
    audit: { list; log; };
    metrics: { system; overview; dashboard; timeSeries; };
    supportSessions: { list; create; revoke; };
    webhooks: { list; register; unregister; };
    connections: { prune; health; stats; shutdown; };
  };
  httpHandlers: {
    adminApi;
    tenantAuth;
    health;
    dev;
  };
  authProviders: {
    admin;
    tenant;
  };
  tenantRegistry;
}
```

### 4. `PgTenantRepository` still provisions schemas internally

Current new `packages/adapters-postgres/src/pg-tenant-repository.ts` still creates `PgTenantSchemaProvisioner` inside `createTenant()` and provisions tenant schema inside repository.

This is still not clean architecture.

Required fix:

- `PgTenantRepository` must only do tenant persistence.
- `PgTenantSchemaProvisioner` must be injected into `CreateTenantUseCase` through the `TenantSchemaProvisioner` port.
- `CreateTenantUseCase` must orchestrate:

```txt
validate input
build schema name
repository.createProvisioningTenant(...)
schemaProvisioner.provisionTenantSchema(...)
repository.markTenantActive(...)
authCache.clearTenant(...)
tenantRegistry.registerTenant(...)
eventPublisher.publish(...)
```

If keeping a transaction is needed, introduce a `UnitOfWork` / `TenantProvisioningTransaction` port instead of instantiating provisioner inside repository.

Minimum acceptable fix:

- Move schema provisioning out of `PgTenantRepository` into use case orchestration via injected port.
- Add repository methods needed for provisioning lifecycle.

### 5. Core use cases are too shallow and incomplete

`packages/core/src/application/tenant/tenant-use-cases.ts` only covers list/get/create/suspend/activate/delete and compresses classes into one-line implementations.

Required fix:

- Implement all P01 required use cases, not just minimal lifecycle.
- Each use case should be readable and independently testable.
- Avoid one-line class bodies for business-critical code.
- Keep use cases dependent on ports only.

Required use cases:

```txt
ListTenantsUseCase
GetTenantUseCase
CreateTenantUseCase
SuspendTenantUseCase
ActivateTenantUseCase
DeleteTenantUseCase
GetTenantMetricsUseCase
GetSystemMetricsUseCase
GetAdminOverviewUseCase
SearchUsersAcrossTenantsUseCase
RevokeUserSessionsUseCase
CreateSupportSessionUseCase
ListActiveSupportSessionsUseCase
RevokeSupportSessionUseCase
PruneIdleConnectionsUseCase
GetSecuritySettingsUseCase
UpdateSecuritySettingsUseCase
GetIpBlocklistUseCase
BlockIpUseCase
UnblockIpUseCase
CheckIpBlockedUseCase
LogAuditActionUseCase
GetAuditLogsUseCase
RegisterWebhookUseCase
UnregisterWebhookUseCase
GetWebhooksUseCase
GetDashboardMetricsUseCase
GetTimeSeriesUseCase
```

### 6. Netlify functions still use old runtime directly

Current `netlify/functions/admin-auth.ts` still imports old modules:

```ts
src/admin/auth.js
src/admin/admin-api.js
src/application/tenant-service.js
src/multi-tenant/connection-manager.js
src/utils/log-stream.js
src/env.js
```

Required fix:

- Netlify functions must be thin wrappers around `packages/server-netlify`.
- Shared tenant resolution/CORS/request mapping must live in `packages/http` or `packages/server-netlify`, not duplicated in each function.
- The functions must use the same container/use cases/auth providers as Fastify where possible.

### 7. `src/server.ts` still owns real runtime behavior

The old file should not be the active runtime after refactor.

Required fix:

- Either delete it, or leave it as a tiny compatibility re-export/wrapper that calls `apps/api/src/main.ts`/`createFastifyApp`.
- It must not keep the old route bodies and old application wiring.
- If retained temporarily, it should be under a clearly named legacy folder and not imported by production scripts.

### 8. Package boundaries must be enforced

Add tests or static checks that fail if forbidden imports are introduced.

Forbidden:

```txt
packages/core -> fastify, @netlify/functions, @prisma/client, pg, better-auth, src/env, src/server, admin-ui
packages/server-fastify -> src/server.js
apps/api/src/main.ts -> src/server.js
packages/sdk -> src/server, Fastify, Netlify, Prisma, pg, Better Auth
netlify/functions -> src/application/tenant-service.js, src/admin/admin-api.js, src/multi-tenant/connection-manager.js directly
```

Add a test such as:

```txt
tests/architecture-boundaries.test.ts
```

It should scan `.ts` files and fail on forbidden import patterns.

### 9. SDK needs package-level legitimacy

Current SDK is a start, but should be hardened.

Required fix:

- Add `packages/sdk/package.json` with proper name, exports, types, build script.
- DTOs must cover admin responses used by Admin UI.
- `RealmioAdminClient` should not be mostly raw route strings in one compressed file.
- Split into resources:

```txt
admin/tenants-resource.ts
admin/security-resource.ts
admin/audit-resource.ts
admin/metrics-resource.ts
admin/users-resource.ts
admin/support-sessions-resource.ts
admin/webhooks-resource.ts
```

- Keep `request()` available for legacy/raw routes, but do not rely on it for core resources.

### 10. Report currently admits limitations that violate P01

The report says:

```txt
src/server.ts remains as the compatibility runtime
packages/server-fastify currently exposes compatibility shims
```

That is exactly what must be fixed in this P02.

Update `docs/clean-architecture-refactor-report.md` after the real fix.

## Implementation Requirements

### A. Real composition root

Implement:

```txt
apps/api/src/main.ts
apps/api/src/container.ts
apps/api/src/config.ts
```

These must actually wire the new architecture.

### B. Real Fastify app factory

Implement:

```txt
packages/server-fastify/src/create-fastify-app.ts
packages/server-fastify/src/middleware/*
packages/server-fastify/src/routes/*
```

No `import '../../../src/server.js'` anywhere.

### C. Real HTTP handlers

Implement or complete:

```txt
packages/http/src/admin-api-handler.ts
packages/http/src/tenant-auth-handler.ts
packages/http/src/health-handler.ts
packages/http/src/dev-handler.ts
packages/http/src/tenant-resolver.ts
packages/http/src/cors-policy.ts
packages/http/src/errors-to-http.ts
```

Handlers should use Web `Request`/`Response` style where useful, but route dispatch must call use cases from the container, not old `src/admin/admin-api.ts`.

### D. Real Netlify wrappers

Implement:

```txt
packages/server-netlify/src/admin-auth-function.ts
packages/server-netlify/src/tenant-auth-function.ts
packages/server-netlify/src/netlify-request-mapper.ts
packages/server-netlify/src/netlify-response-mapper.ts
```

Then make:

```txt
netlify/functions/admin-auth.ts
netlify/functions/tenant-auth.ts
```

thin exports only.

### E. Real ports/adapters wiring

Use concrete adapters from packages, not old `src/*` service singletons.

### F. Remove fake shims

Delete or rewrite all files that are only compatibility shims back to old server/service.

Mandatory removals/replacements:

```txt
apps/api/src/main.ts must not import src/server.js
packages/server-fastify/src/create-fastify-app.ts must not import src/server.js
apps/api/src/container.ts must not expose old tenantService as primary application service
netlify/functions/*.ts must not directly use old src application/admin runtime
```

## Acceptance Criteria

This P02 is complete only if:

1. `npm run check` passes.
2. `npm test` passes.
3. `npm run build` passes.
4. Architecture-boundary test passes.
5. No forbidden imports remain.
6. `apps/api/src/main.ts` is real composition root.
7. `packages/server-fastify/src/create-fastify-app.ts` creates a real Fastify instance.
8. Netlify functions are thin wrappers around new package handlers.
9. `PgTenantRepository` no longer provisions schema internally.
10. `CreateTenantUseCase` orchestrates provisioning through ports.
11. Admin UI still builds and uses SDK.
12. SDK has package metadata and resource modules.
13. Existing endpoints remain compatible.
14. `docs/clean-architecture-refactor-report.md` is updated honestly and no longer says server-fastify is a compatibility shim.

## Final Report Required

Update:

```txt
docs/clean-architecture-refactor-report.md
```

Add a section:

```txt
P02 Corrective Refactor Verification
```

Include:

- forbidden import scan result.
- build/check/test result.
- before/after of main runtime path.
- before/after of Fastify app factory.
- before/after of Netlify function wrappers.
- list of old files removed or reduced to wrappers.
- exact remaining limitations if any.

## Commit Required

Commit with message:

```txt
fix: complete hexagonal refactor wiring
```
