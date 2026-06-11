# Replit/Codex Prompt — P01 One-Shot Clean Architecture, Hexagonal Architecture, Separation of Concern, and SDK Refactor

You are working on the private GitHub repository:

```txt
Rndynt/Realmio
```

Current default branch is `multi-tenant`.

This is a one-shot refactor request. Do **not** split the work into small future phases. Perform the full refactor in a single coherent implementation while preserving the current runtime behavior and public API compatibility unless explicitly stated otherwise.

## Objective

Refactor Realmio into a clean architecture / hexagonal architecture codebase with strict separation of concerns and a reusable TypeScript SDK.

Realmio is currently a multi-tenant Better Auth based auth/tenant management service with:

- Fastify runtime server.
- Netlify function runtime support.
- Better Auth integration.
- Tenant registry and per-tenant Prisma clients.
- Admin API.
- Admin UI.
- Public/tenant auth endpoints.
- Tenant provisioning through schema-per-tenant.
- Security settings, audit logs, webhooks, metrics, support sessions, and connection management.

The current implementation already has some folders named `domain`, `application`, and `infrastructure`, but the boundaries are not strict. The refactor must make the architecture real, not cosmetic.

## Current Critical Problems To Fix

### 1. `src/server.ts` is a god entrypoint

It currently mixes:

- Fastify creation.
- Security headers.
- CORS.
- Rate limit registration.
- IP blocking.
- Global error handler.
- Auth mode selection.
- Single-tenant auth forwarding.
- Multi-tenant auth forwarding.
- Tenant route resolution.
- Admin routes.
- Legacy auth route.
- Health endpoints.
- Dev endpoints.
- Admin UI static serving.
- SPA fallback.

Refactor it so the server entrypoint becomes a thin composition root only.

### 2. `src/application/tenant-service.ts` violates clean architecture

It currently imports infrastructure/runtime dependencies directly, including but not limited to:

- tenant manager singleton.
- auth cache factory.
- env/trusted origins/dev flags.
- webhook util.
- concrete `PgTenantRepository`.

Split this file into focused application use cases and inject dependencies through ports/interfaces.

### 3. `src/infrastructure/db/tenant-repository.ts` is too broad

It currently does all of these:

- tenant CRUD.
- tenant status update.
- security settings persistence.
- audit logs.
- tenant status DB constraint validation.
- schema provisioning.
- Better Auth table cloning.

Split it into separate adapters:

- tenant repository.
- security settings repository.
- audit log repository.
- tenant schema provisioner.

### 4. `src/multi-tenant/connection-manager.ts` is infrastructure but is used globally

It currently exports a singleton and registers shutdown signal handlers at module import time.

Move side effects to runtime composition. The manager should be an adapter implementing core ports, not a global application dependency.

### 5. Fastify and Netlify duplicate adapter logic

Netlify functions and Fastify routes both contain their own request mapping, CORS, tenant extraction, tenant validation, and auth forwarding logic.

Unify shared behavior through common HTTP adapters/services. Runtime-specific files should be thin.

### 6. Admin UI has a fetch helper, not a real SDK

`admin-ui/lib/api-client.ts` is a direct fetch wrapper with hardcoded paths and weak error handling. Extract this into a reusable SDK package and make the Admin UI use the SDK.

### 7. Build/deploy scripts are inconsistent

Current issues:

- `package.json` says `build: tsc -p tsconfig.json` and `start: node dist/server.js`.
- `tsconfig.json` currently has `noEmit: true`.
- Docker runs `npx tsx src/server.ts` directly.
- Docker exposes `4000` while env defaults may use another port.

Normalize development and production build behavior.

## Required Target Architecture

Create or refactor toward this structure. You may adjust names if needed, but the dependency direction must stay the same.

```txt
apps/
  api/
    src/
      main.ts
      container.ts
      config.ts
  admin-ui/
    # move or preserve current admin-ui app here if practical

packages/
  core/
    src/
      domain/
        tenant/
        security/
        audit/
        webhook/
      application/
        tenant/
        security/
        audit/
        support-session/
        metrics/
        webhook/
      ports/
        tenant-repository.ts
        tenant-schema-provisioner.ts
        tenant-registry.ts
        tenant-client-provider.ts
        tenant-auth-provider.ts
        admin-auth-provider.ts
        auth-cache.ts
        security-settings-repository.ts
        audit-log-repository.ts
        event-publisher.ts
        metrics-store.ts
        log-stream.ts
      contracts/
        admin-api.contract.ts
        tenant-auth.contract.ts
        tenant.dto.ts
        security.dto.ts
        audit.dto.ts
        metrics.dto.ts
      errors/
        app-error.ts
        tenant-errors.ts

  adapters-postgres/
    src/
      pg-tenant-repository.ts
      pg-security-settings-repository.ts
      pg-audit-log-repository.ts
      pg-tenant-schema-provisioner.ts
      pg-pool.ts
      mappers/
        tenant.mapper.ts

  adapters-better-auth/
    src/
      better-auth-admin-provider.ts
      better-auth-tenant-provider.ts
      better-auth-factory.ts
      better-auth-request-forwarder.ts

  adapters-runtime/
    src/
      tenant-connection-manager.ts
      tenant-registry-adapter.ts
      auth-cache-adapter.ts
      webhook-event-publisher.ts
      metrics-store-adapter.ts
      log-stream-adapter.ts

  http/
    src/
      request-context.ts
      http-response.ts
      tenant-resolver.ts
      cors-policy.ts
      errors-to-http.ts
      admin-api-handler.ts
      tenant-auth-handler.ts
      health-handler.ts
      dev-handler.ts

  server-fastify/
    src/
      create-fastify-app.ts
      middleware/
        request-id.ts
        security-headers.ts
        rate-limit.ts
        ip-blocking.ts
      routes/
        admin.routes.ts
        tenant-auth.routes.ts
        health.routes.ts
        dev.routes.ts
        static-ui.routes.ts

  server-netlify/
    src/
      admin-auth-function.ts
      tenant-auth-function.ts
      netlify-request-mapper.ts
      netlify-response-mapper.ts

  sdk/
    src/
      index.ts
      realmio-admin-client.ts
      realmio-tenant-auth-client.ts
      transport/
        fetch-transport.ts
      errors.ts
      dto/
        tenant.dto.ts
        security.dto.ts
        audit.dto.ts
        metrics.dto.ts
```

If moving `admin-ui/` into `apps/admin-ui/` is too disruptive in one pass, keep the folder at root but still make it consume `packages/sdk`. Do not break the admin UI build.

## Dependency Rules

These rules are mandatory.

```txt
packages/core
  must NOT import Fastify, Netlify, Prisma, pg, Better Auth, env singleton, node process globals, or UI code.

packages/adapters-*
  may import external libraries and must implement ports from packages/core.

packages/http
  may depend on packages/core contracts/use cases, but must not depend on Fastify or Netlify.

packages/server-fastify
  may depend on packages/http and runtime adapters.

packages/server-netlify
  may depend on packages/http and runtime adapters.

packages/sdk
  must not import server runtime code. It only depends on fetch-compatible transport and contracts/DTOs.

admin-ui
  must call Realmio SDK, not raw hardcoded fetch helpers.
```

## Public API Compatibility Requirements

Preserve these existing endpoint behaviors unless impossible:

### Admin auth

```txt
/admin/auth/*
```

Must continue forwarding to the admin Better Auth instance.

### Admin API

```txt
/admin/api
/admin/api/*
/admin/log-stream
```

Must preserve current route behavior and response shapes for existing UI pages.

### Tenant auth

```txt
/api/auth/*
/tenant/:tenantId/api/auth/*
```

Must continue supporting tenant resolution from:

1. `X-Tenant-Id` header.
2. subdomain.
3. `/tenant/:tenantId/...` path where applicable.

### Legacy route

```txt
/legacy/auth/*
```

Preserve backward compatibility and deprecation headers.

### Health endpoints

```txt
/healthz
/tenant/:tenantId/health
```

Preserve equivalent behavior.

### Admin UI serving

The deployed app must still serve the Admin UI SPA correctly from the API service when using the current Docker-style runtime.

## Application Use Cases To Extract

Create focused use cases instead of one large `TenantService`.

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

You may group them under cohesive services only if each service depends purely on ports and remains small. Avoid a new god service.

## Domain Model Requirements

Replace DB-shaped domain models with clean domain types.

Use camelCase in domain/contracts:

```ts
type Tenant = {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  status: TenantStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};
```

DB snake_case should exist only in Postgres adapter mapper code.

Keep validation helpers for:

- tenant id.
- tenant slug.
- schema name.
- IP/CIDR.
- security settings.

## Ports To Introduce

At minimum create these ports in `packages/core/src/ports`:

```ts
export interface TenantRepository { ... }
export interface TenantSchemaProvisioner { ... }
export interface TenantRegistry { ... }
export interface TenantClientProvider { ... }
export interface TenantAuthProvider { ... }
export interface AdminAuthProvider { ... }
export interface AuthCache { ... }
export interface SecuritySettingsRepository { ... }
export interface AuditLogRepository { ... }
export interface EventPublisher { ... }
export interface MetricsStore { ... }
export interface LogStream { ... }
```

Use dependency injection from `apps/api/src/container.ts`.

Do not instantiate concrete adapters inside core use cases.

## SDK Requirements

Create `packages/sdk`.

The SDK must provide:

```ts
import {
  RealmioAdminClient,
  RealmioTenantAuthClient,
  RealmioApiError,
} from "@realmio/sdk";
```

### Admin client example

```ts
const client = new RealmioAdminClient({
  baseUrl: "https://auth.example.com",
  credentials: "include",
});

await client.tenants.list();
await client.tenants.create({ id: "nusa", name: "Nusa", slug: "nusa" });
await client.tenants.suspend("nusa");
await client.security.getSettings();
await client.audit.list({ limit: 50 });
```

### Tenant auth client example

```ts
const auth = new RealmioTenantAuthClient({
  baseUrl: "https://auth.example.com",
  tenantId: "nusa",
  credentials: "include",
});

await auth.email.signIn({ email: "owner@example.com", password: "secret" });
await auth.session.get();
await auth.email.signOut();
```

### SDK design rules

- Use typed DTOs.
- Use `RealmioApiError` with status, code, message, details, and response body.
- Support custom `fetch` implementation.
- Support `credentials`.
- Support request timeout via AbortController.
- Support `X-Tenant-Id` for tenant auth client.
- Do not import server/runtime files.
- Admin UI must use this SDK instead of `admin-ui/lib/api-client.ts` raw fetch implementation.

## Admin UI Integration

Refactor Admin UI so:

- API calls go through `packages/sdk`.
- Existing UI behavior remains unchanged.
- Keep current route/pages intact.
- Remove or replace `admin-ui/lib/api-client.ts` with a thin SDK factory wrapper.
- Do not hardcode backend URLs in many components.
- Keep same-origin production behavior.

## Fastify Runtime Requirements

Create a Fastify app factory similar to:

```ts
export async function createFastifyApp(container: AppContainer): Promise<FastifyInstance> {
  const app = Fastify(...);
  await registerRequestId(app);
  await registerSecurityHeaders(app);
  await registerCors(app, container.corsPolicy);
  await registerRateLimit(app, container.rateLimitConfig);
  await registerIpBlocking(app, container.useCases.security.checkIpBlocked);
  await registerTenantAuthRoutes(app, container.httpHandlers.tenantAuth);
  await registerAdminRoutes(app, container.httpHandlers.adminApi);
  await registerHealthRoutes(app, container.httpHandlers.health);
  await registerDevRoutes(app, container.httpHandlers.dev);
  await registerStaticUiRoutes(app, container.staticUiConfig);
  return app;
}
```

`apps/api/src/main.ts` should initialize config/container and start the server.

## Netlify Runtime Requirements

Refactor Netlify functions into thin adapters:

```txt
netlify/functions/admin-auth.ts
netlify/functions/tenant-auth.ts
```

They can import from `packages/server-netlify` or become wrappers around it.

Do not duplicate tenant resolution and auth forwarding logic between Fastify and Netlify.

## Better Auth Adapter Requirements

Move Better Auth specific code behind ports.

Required behavior:

- Admin auth uses system/admin schema as before.
- Tenant auth uses tenant-specific Prisma client/schema as before.
- Auth instance cache remains protected against concurrent creation race conditions.
- Cache can be cleared for one tenant or all tenants.
- Auth stats remain available for admin overview.
- Existing plugins stay enabled: admin, organization, apiKey, jwt, bearer, twoFactor.

## Tenant Registry / Connection Manager Requirements

The connection manager must:

- stay capable of per-tenant Prisma client creation.
- keep LRU eviction.
- keep idle cleanup.
- keep health/stats.
- not register process signal handlers at module import time.
- implement ports from core.
- be instantiated in the app container.
- be shut down from `main.ts` graceful shutdown handler.

## Database Adapter Requirements

Split Postgres code:

```txt
PgTenantRepository
PgTenantSchemaProvisioner
PgSecuritySettingsRepository
PgAuditLogRepository
```

Rules:

- repositories map DB rows to clean domain/contracts.
- DDL/provisioning belongs in schema provisioner.
- audit logs belong in audit repository.
- security settings belong in security repository.
- no SQL query string should live in application use cases.

## Contract/Error Requirements

Standardize API error responses. Use a single shape where possible:

```ts
{
  error: string;
  message: string;
  details?: unknown;
  requestId?: string;
}
```

Preserve existing important error codes:

```txt
TENANT_REQUIRED
TENANT_INVALID
TENANT_NOT_FOUND
TENANT_SUSPENDED
UNAUTHORIZED
VALIDATION_ERROR
INVALID_JSON
INTERNAL_ERROR
```

## Build System Requirements

Fix build/deploy inconsistency.

Recommended approach:

- Use npm workspaces if practical.
- Use TypeScript project references or tsup/esbuild.
- Development may use `tsx`.
- Production must build to `dist` and run with `node`.
- Docker must not run raw TypeScript in production.
- Keep Prisma generate step.
- Ensure Admin UI build still works.

Minimum scripts expected at root:

```json
{
  "scripts": {
    "dev": "tsx apps/api/src/main.ts",
    "build": "npm run build:packages && npm run build:api && npm run build:admin-ui",
    "build:api": "tsc -p apps/api/tsconfig.json",
    "build:admin-ui": "npm --prefix admin-ui run build",
    "start": "node dist/apps/api/main.js",
    "check": "tsc -b",
    "test": "node --import tsx --test"
  }
}
```

You may adjust exact paths if using a different build strategy, but production must be coherent.

## Testing Requirements

Keep and expand tests.

Current test exists for admin API snapshot. Preserve it and update imports if paths move.

Add tests for:

- tenant id/slug/schema validation.
- tenant mapper DB row <-> domain.
- create tenant use case with fake ports.
- suspend/activate/delete tenant use cases.
- security settings use cases.
- SDK request construction.
- SDK error parsing.
- tenant resolver from header/path/subdomain.
- admin API handler route dispatch.

Tests must not require a real database unless explicitly integration tests.

## Migration Strategy Inside This One-Shot Refactor

Even though this is one implementation pass, do it safely:

1. Create new packages/folders.
2. Move pure domain/contracts first.
3. Introduce ports.
4. Extract use cases from `TenantService`.
5. Split DB adapters.
6. Move Better Auth implementation behind adapters.
7. Build HTTP handlers independent from Fastify/Netlify.
8. Rewire Fastify server through container.
9. Rewire Netlify functions through shared handlers.
10. Extract SDK from Admin UI fetch helper.
11. Update Admin UI to use SDK.
12. Fix build scripts and Dockerfile.
13. Run checks/tests.
14. Remove dead duplicated old files only after replacements compile.

## Non-Negotiable Constraints

- Do not remove existing functionality.
- Do not break current endpoint paths.
- Do not remove Better Auth plugins.
- Do not remove multi-tenant schema-per-tenant behavior.
- Do not make Admin UI unusable.
- Do not leave both old and new services active with conflicting behavior.
- Do not introduce fake implementations in production code.
- Do not commit secrets.
- Do not make app depend on Replit-only URLs.
- Do not leave `tsx src/server.ts` as production Docker command.
- Do not keep application layer importing concrete infrastructure.

## Acceptance Criteria

The refactor is complete only when all are true:

### Architecture

- Core package has no imports from Fastify, Netlify, Prisma, pg, Better Auth, admin-ui, or concrete env singleton.
- Application use cases depend on ports only.
- Infrastructure adapters implement core ports.
- Fastify and Netlify are thin transport adapters.
- Tenant provisioning is not inside tenant repository.
- Tenant connection manager is not a global singleton dependency in application layer.

### SDK

- `packages/sdk` exists.
- Admin UI uses the SDK.
- SDK exposes admin and tenant auth clients.
- SDK has typed DTOs and typed errors.
- SDK supports custom fetch, credentials, timeout, and tenant header.

### Runtime

- Existing endpoints continue working.
- Admin auth works.
- Tenant auth works with header/subdomain/path tenant resolution.
- Admin API works.
- Admin log stream works.
- Health endpoints work.
- Admin UI static serving still works in Docker/Fastify runtime.
- Netlify functions still compile.

### Build/Test

- `npm run check` passes.
- `npm test` passes.
- `npm run build` passes or has a documented unavoidable limitation with exact fix notes.
- Dockerfile runs built JavaScript in production.

## Final Report Required

After implementing, create or update:

```txt
docs/clean-architecture-refactor-report.md
```

The report must include:

- Summary of changed architecture.
- New folder/package map.
- Dependency direction explanation.
- List of migrated files.
- List of deleted/replaced old files.
- SDK usage examples.
- API compatibility notes.
- Build/test results.
- Known limitations, if any.

## Commit Requirements

Commit all changes with a clear message, for example:

```txt
refactor: introduce clean hexagonal architecture and SDK
```

Do not stop after only writing documents. Implement the refactor in code.
