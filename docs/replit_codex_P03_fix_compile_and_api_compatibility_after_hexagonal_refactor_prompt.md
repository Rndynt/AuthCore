# Replit/Codex Prompt — P03 Fix Compile, Test, and API Compatibility Regressions After Hexagonal Refactor

Repository:

```txt
Rndynt/Realmio
```

Branch:

```txt
multi-tenant
```

Context:

P02 introduced a better real wiring commit:

```txt
932d1f69c31134c37e9fbd4d0730b49142fcab4c
P02: wire real adapters — complete hexagonal refactor
```

The architecture is now closer to the target, but there are still fatal compile/runtime/API compatibility issues. This P03 must fix those issues directly. Do not create cosmetic documents only. Implement the patch, run checks/tests/build, and commit.

## Critical Issues Found

### 1. `packages/server-fastify/src/create-fastify-app.ts` imports `AppContainer` from a broken relative path

Current:

```ts
import type { AppContainer } from '../../apps/api/src/container';
```

From `packages/server-fastify/src`, that path resolves incorrectly under `packages/apps/...`, not root `apps/...`.

Fix all server package imports of `AppContainer` to use the correct root-relative relative path, for example:

```ts
import type { AppContainer } from '../../../apps/api/src/container.js';
```

Apply the same fix in all route files currently using:

```ts
../../../apps/api/src/container
```

or any other invalid path.

### 2. `createFastifyApp` uses `@fastify/formbody` but the dependency is missing

Current code registers:

```ts
await app.register(import('@fastify/formbody' as any));
```

But root `package.json` does not include `@fastify/formbody`.

Fix one of these ways:

- Preferred: remove formbody if not required by Better Auth forwarding because JSON/body handling is enough for existing API; or
- Add `@fastify/formbody` dependency and import/register it correctly.

Do not leave a runtime-only missing dependency.

Also do not pass a raw dynamic import Promise to `app.register`. Use a proper plugin import:

```ts
import formbody from '@fastify/formbody';
await app.register(formbody);
```

or remove it entirely.

### 3. Tenant auth route registration is wrong and breaks existing API compatibility

Current `packages/server-fastify/src/routes/tenant-auth.routes.ts` registers:

```ts
app.all('/api/auth/:tenantSlug/*', async (request, reply) => {
  const slug = (request.params as any).tenantSlug as string;
  const webRequest = fastifyToWebRequest(request);
  const response = await tenantAuth.handle(slug, webRequest);
  await webResponseToFastify(response, reply);
});
```

This is wrong for two reasons:

1. The old API contract was `/api/auth/*`, not `/api/auth/:tenantSlug/*`.
2. `TenantAuthHandler.handle()` expects `(request: Request, options?: { pathTenantId?: string; stripTenantPrefix?: boolean })`, but the route passes `(slug, webRequest)`.

Required preserved routes:

```txt
/api/auth/*
/tenant/:tenantId/api/auth/*
/legacy/auth/*
```

Tenant resolution must keep supporting:

1. `X-Tenant-Id` header.
2. subdomain.
3. `/tenant/:tenantId/...` path.

Fix `registerTenantAuthRoutes` so it registers:

```ts
app.all('/api/auth/*', async (request, reply) => {
  const response = await tenantAuth.handle(fastifyToWebRequest(request));
  await webResponseToFastify(response, reply);
});

app.all('/tenant/:tenantId/api/auth/*', async (request, reply) => {
  const tenantId = (request.params as any).tenantId;
  const response = await tenantAuth.handle(fastifyToWebRequest(request), {
    pathTenantId: tenantId,
    stripTenantPrefix: true,
  });
  await webResponseToFastify(response, reply);
});
```

Also preserve `/legacy/auth/*` with deprecation headers and forwarding behavior. If it maps to default/single auth behavior, implement a compatibility handler explicitly. Do not remove it.

### 4. Admin route must support `/admin/api` without wildcard

Current route registers only:

```txt
/admin/api/*
```

Old behavior supported both:

```txt
/admin/api
/admin/api/*
```

Add explicit route for `/admin/api`.

### 5. Architecture boundary test uses `vitest`, but test runner is `node:test`

Current root script:

```json
"test": "node --import tsx --test tests/*.test.ts scripts/admin-auth-smoke-test.js test-auth-service.js"
```

But `tests/architecture-boundaries.test.ts` imports:

```ts
import { describe, it, expect } from 'vitest';
```

`vitest` is not listed in devDependencies and this test will fail under `node --test`.

Fix by converting `tests/architecture-boundaries.test.ts` to Node built-ins:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
```

Do not add Vitest just for one test unless the whole test strategy is migrated.

### 6. Tenant use-case tests are stale after CreateTenantUseCase gained TenantSchemaProvisioner dependency

Current `tests/tenant-use-cases.test.ts` builds deps without:

```ts
tenantSchemaProvisioner
```

But `CreateTenantUseCase` now requires and calls:

```ts
this.deps.tenantSchemaProvisioner.provisionTenantSchema(...)
```

Fix the test fake deps by adding:

```ts
tenantSchemaProvisioner: {
  provisionTenantSchema: async () => undefined,
}
```

Also update fake repository to implement the new `createProvisioningTenant` and `markTenantActive` methods, not only old `createTenant`.

### 7. Fastify CORS allowed headers must preserve existing tenant/auth headers

P02 currently allows only:

```ts
['Content-Type', 'Authorization', 'X-Request-ID']
```

Old behavior allowed tenant/API-key related headers:

```txt
Content-Type
Authorization
X-Requested-With
x-api-key
X-Tenant-Id
X-Request-Id
```

Restore compatibility:

```ts
allowedHeaders: [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'x-api-key',
  'X-Tenant-Id',
  'X-Request-Id',
  'X-Request-ID',
]
```

### 8. Static admin UI route must not be swallowed by generic 404

Verify `registerStaticUiRoutes` still serves:

- Admin UI static output.
- SPA fallback for non-API routes.
- Does not intercept `/api`, `/admin`, `/tenant`, `/legacy`, `/dev`, `/healthz`.

If broken, fix it.

### 9. SDK package export typo/check

Verify `packages/sdk/package.json` exports point to actual files. It currently exports:

```json
"./tenant": {
  "import": "./src/tenant-auth-client.js",
  "types": "./src/tenant-auth-client.ts"
}
```

But current client file is likely:

```txt
packages/sdk/src/realmio-tenant-auth-client.ts
```

Fix package exports so they match real file names.

Expected:

```json
"./tenant": {
  "import": "./src/realmio-tenant-auth-client.js",
  "types": "./src/realmio-tenant-auth-client.ts"
}
```

### 10. Run real check/build/test and update report honestly

After implementation, run:

```txt
npm run check
npm test
npm run build
```

Fix any failures. Do not simply claim passing.

Update:

```txt
docs/clean-architecture-refactor-report.md
```

Add:

```txt
P03 Compile/Test/API Compatibility Fixes
```

Include:

- exact command results.
- tenant auth route compatibility confirmation.
- admin route compatibility confirmation.
- test runner correction.
- SDK package export correction.
- remaining limitations, if any.

## Acceptance Criteria

P03 is complete only if all are true:

1. `npm run check` passes.
2. `npm test` passes under Node test runner.
3. `npm run build` passes.
4. No route calls `tenantAuth.handle()` with wrong argument order.
5. `/api/auth/*` is supported.
6. `/tenant/:tenantId/api/auth/*` is supported.
7. `/legacy/auth/*` remains supported with deprecation headers.
8. `/admin/api` and `/admin/api/*` are both supported.
9. `@fastify/formbody` is either properly installed/imported or removed.
10. Architecture boundary tests run without Vitest.
11. Tenant use-case tests include `tenantSchemaProvisioner` and new repository methods.
12. SDK package exports match actual file names.
13. CORS preserves `X-Tenant-Id` and `x-api-key` headers.
14. Report is updated honestly.

## Commit Required

Commit all changes with:

```txt
fix: restore api compatibility after hexagonal wiring
```
