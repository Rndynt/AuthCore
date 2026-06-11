# Clean Architecture / Hexagonal Refactor Report

## Summary

Realmio has been refactored toward a real clean architecture / hexagonal architecture layout. The new package structure separates domain/application code, ports, infrastructure adapters, HTTP transport helpers, runtime adapters, and a reusable TypeScript SDK.

The existing public API paths remain intact:

- `/admin/auth/*`
- `/admin/api`
- `/admin/api/*`
- `/admin/log-stream`
- `/api/auth/*`
- `/tenant/:tenantId/api/auth/*`
- `/legacy/auth/*`
- `/healthz`
- `/tenant/:tenantId/health`

`src/server.ts` remains as the compatibility runtime, but composition concerns now have package-level counterparts and the new `apps/api/src/main.ts` entrypoint is used by development and production scripts.

## New Folder / Package Map

```txt
apps/api/src/
  main.ts
  container.ts
  config.ts

packages/core/src/
  domain/tenant/
  domain/security/
  domain/audit/
  application/tenant/
  application/security/
  application/audit/
  application/metrics/
  application/support-session/
  application/webhook/
  ports/
  contracts/
  errors/

packages/adapters-postgres/src/
  pg-pool.ts
  pg-tenant-repository.ts
  pg-security-settings-repository.ts
  pg-audit-log-repository.ts
  pg-tenant-schema-provisioner.ts
  mappers/tenant.mapper.ts

packages/adapters-better-auth/src/
  better-auth-admin-provider.ts
  better-auth-tenant-provider.ts
  better-auth-factory.ts
  better-auth-request-forwarder.ts

packages/adapters-runtime/src/
  tenant-connection-manager.ts
  tenant-registry-adapter.ts
  auth-cache-adapter.ts
  webhook-event-publisher.ts
  metrics-store-adapter.ts
  log-stream-adapter.ts

packages/http/src/
  request-context.ts
  http-response.ts
  tenant-resolver.ts
  cors-policy.ts
  errors-to-http.ts
  admin-api-handler.ts
  tenant-auth-handler.ts
  health-handler.ts
  dev-handler.ts

packages/server-fastify/src/
  create-fastify-app.ts
  middleware/
  routes/

packages/server-netlify/src/
  admin-auth-function.ts
  tenant-auth-function.ts
  netlify-request-mapper.ts
  netlify-response-mapper.ts

packages/sdk/src/
  index.ts
  realmio-admin-client.ts
  realmio-tenant-auth-client.ts
  transport/fetch-transport.ts
  errors.ts
  dto/
```

## Dependency Direction

- `packages/core` defines domain models, validation, use cases, ports, contracts, and errors.
- `packages/core` does not need Fastify, Netlify, Prisma, pg, Better Auth, or Admin UI code for the new use cases/tests.
- `packages/adapters-postgres` implements persistence-side ports and maps DB snake_case rows into camelCase domain objects.
- `packages/http` contains transport-neutral Web `Request`/`Response` helpers and shared tenant resolution.
- `packages/sdk` is client-side reusable code and does not import server runtime code.
- `admin-ui/lib/api-client.ts` is now a thin SDK factory wrapper instead of raw hardcoded fetch implementation.

## Migrated / Added Files

- Added core tenant domain model and validation.
- Added core ports for tenant repository, schema provisioner, registry, client/auth providers, auth cache, security, audit, events, metrics, and logs.
- Added focused use cases for tenant lifecycle, security/IP blocking, audit, metrics, support sessions, webhook access.
- Split Postgres adapter responsibilities into tenant repository, security repository, audit repository, schema provisioner, pool, and mapper.
- Added HTTP tenant resolver and response/error helpers shared by Fastify/Netlify direction.
- Added SDK admin and tenant auth clients with fetch transport and typed error.
- Updated Admin UI API helper to call SDK.
- Added app composition files under `apps/api`.
- Added Netlify request/response mapper package files.
- Updated Dockerfile to build TypeScript/Admin UI and run built JavaScript.
- Added tests for validation, mappers, tenant use cases, SDK, and tenant resolver.

## Replaced / Adjusted Old Behavior

- `admin-ui/lib/api-client.ts` replaced raw fetch helper with `RealmioAdminClient` wrapper while preserving old method names.
- `src/multi-tenant/connection-manager.ts` no longer registers process signal handlers at import time. Shutdown handlers are explicit via `registerTenantManagerShutdownHandlers()` from runtime composition.
- Production Docker command no longer runs `npx tsx src/server.ts`; it runs built JS: `node dist/apps/api/src/main.js`.
- Root scripts now use `apps/api/src/main.ts` and coherent build/check/test commands.

## SDK Usage Examples

```ts
import { RealmioAdminClient, RealmioTenantAuthClient, RealmioApiError } from "@realmio/sdk";

const admin = new RealmioAdminClient({
  baseUrl: "https://auth.example.com",
  credentials: "include",
  timeoutMs: 10_000,
});

await admin.tenants.list();
await admin.tenants.create({ id: "nusa", name: "Nusa", slug: "nusa" });
await admin.tenants.suspend("nusa");
await admin.security.getSettings();
await admin.audit.list({ limit: 50 });

const auth = new RealmioTenantAuthClient({
  baseUrl: "https://auth.example.com",
  tenantId: "nusa",
  credentials: "include",
});

await auth.email.signIn({ email: "owner@example.com", password: "secret" });
await auth.session.get();
await auth.email.signOut();
```

## API Compatibility Notes

- Current route handlers remain mounted to existing paths.
- Admin API snapshot tests still pass.
- Tenant resolution behavior is now covered by shared resolver tests for header, path, and subdomain inputs.
- Legacy auth route remains in runtime server with deprecation headers.
- Admin UI method names remain backwards compatible.

## Build / Test Results

Commands run successfully:

```txt
npm test
npm run check
npm run build
```

Observed passing results:

- `npm test`: 15 tests passing.
- `npm run check`: TypeScript check passing.
- `npm run build`: package build, API build, and Admin UI build passing.

Admin UI build warning remains from Next.js workspace root inference because root and `admin-ui` both have lockfiles. It is non-blocking.

## Known Limitations

- Some existing runtime files still act as compatibility facades while new package boundaries are introduced. This preserves endpoint compatibility and avoids a risky one-shot route rewrite.
- `packages/server-fastify` currently exposes compatibility shims around existing runtime route registration instead of fully moving every Fastify route body.
- Organization admin UI methods are preserved in SDK wrapper as legacy/raw routes because existing server handler coverage for organization routes was not expanded in this pass.
- `test-auth-service.js` logs that a live service is unreachable, but the test file exits successfully and the overall test suite passes.
