# P06 — Legacy src/ Decomposition Migration Map

## Migration Status

Each row shows where a `src/` module now lives and the current state of the original file.

| Original `src/` Path | New Location | Original File State |
|---|---|---|
| `src/env.ts` | `packages/config/src/env.ts` | Shim: `export * from '../packages/config/src/env.js'` |
| `src/config/auth-mode.ts` | `packages/config/src/auth-mode.ts` | Shim: `export * from '../../packages/config/src/auth-mode.js'` |
| `src/config/features.ts` | `packages/config/src/features.ts` | Shim: `export * from '../../packages/config/src/features.js'` |
| `src/admin/auth.ts` | `packages/adapters-better-auth/src/admin-auth-instance.ts` | Shim: re-exports from package |
| `src/multi-tenant/auth-factory.ts` | `packages/adapters-better-auth/src/tenant-auth-factory.ts` | Shim: re-exports from package |
| `src/multi-tenant/connection-manager.ts` | `packages/adapters-runtime/src/tenant-connection-manager-impl.ts` | Shim: re-exports from package |
| `src/multi-tenant/types.ts` | `packages/adapters-runtime/src/types.ts` | Copied verbatim |
| `src/utils/log-stream.ts` | `packages/adapters-runtime/src/log-stream.ts` | Shim: `export * from '../../packages/adapters-runtime/src/log-stream.js'` |
| `src/utils/metrics-store.ts` | `packages/adapters-runtime/src/metrics-store.ts` | Shim: re-exports from package |
| `src/utils/webhook.ts` | `packages/adapters-runtime/src/webhook.ts` | Shim: re-exports from package |
| `src/utils/ip-utils.ts` | `packages/adapters-runtime/src/ip-utils.ts` | Shim: re-exports from package |
| `src/admin/admin-api.ts` | `packages/http/src/admin-api-handler.ts` | **Deleted** |
| `src/admin/routes.ts` | `packages/server-fastify/src/routes/admin.routes.ts` | **Deleted** |
| `src/application/tenant-service.ts` | `packages/core/src/application/tenant/*` | **Deleted** |

## New Package: `packages/config`

Created to own all runtime configuration, previously scattered across `src/env.ts` and `src/config/`:

```
packages/config/src/
├── env.ts          ← all env-var parsing (DATABASE_URL, BETTER_AUTH_SECRET, PORT, …)
├── auth-mode.ts    ← auth mode resolution (database/edge/netlify)
├── features.ts     ← feature-flag derivation from auth config
└── index.ts        ← barrel export
```

## Updated Adapter Imports

| Adapter | Was importing from | Now importing from |
|---|---|---|
| `packages/adapters-postgres/src/pg-pool.ts` | `src/env.js` | `packages/config/src/env.js` |
| `packages/adapters-better-auth/src/better-auth-admin-provider.ts` | `src/admin/auth.js` | `./admin-auth-instance.js` |
| `packages/adapters-better-auth/src/better-auth-tenant-provider.ts` | `src/multi-tenant/auth-factory.js` | `./tenant-auth-factory.js` |
| `packages/adapters-better-auth/src/better-auth-factory.ts` | `src/multi-tenant/auth-factory.js` | `./tenant-auth-factory.js` |
| `packages/adapters-runtime/src/auth-cache-adapter.ts` | `src/multi-tenant/auth-factory.js` | `../../adapters-better-auth/src/tenant-auth-factory.js` |
| `packages/adapters-runtime/src/tenant-registry-adapter.ts` | `src/multi-tenant/connection-manager.js` | `./tenant-connection-manager-impl.js` |
| `packages/adapters-runtime/src/tenant-connection-manager.ts` | `src/multi-tenant/connection-manager.js` | `./tenant-connection-manager-impl.js` |
| `packages/adapters-runtime/src/log-stream-adapter.ts` | `src/utils/log-stream.js` | `./log-stream.js` |
| `packages/adapters-runtime/src/metrics-store-adapter.ts` | `src/utils/metrics-store.js` | `./metrics-store.js` |
| `packages/adapters-runtime/src/webhook-event-publisher.ts` | `src/utils/webhook.js` | `./webhook.js` |
| `apps/api/src/config.ts` | `src/env.js`, `src/config/*.js` | `packages/config/src/*.js` |
| `apps/api/src/container.ts` | `src/utils/ip-utils.js` | `packages/adapters-runtime/src/ip-utils.js` |

## src/ Files Remaining (shims only — P07 target)

```
src/
├── env.ts                          shim → packages/config/src/env.ts
├── config/
│   ├── auth-mode.ts                shim → packages/config/src/auth-mode.ts
│   └── features.ts                 shim → packages/config/src/features.ts
├── admin/
│   └── auth.ts                     shim → packages/adapters-better-auth/src/admin-auth-instance.ts
├── multi-tenant/
│   ├── auth-factory.ts             shim → packages/adapters-better-auth/src/tenant-auth-factory.ts
│   ├── connection-manager.ts       shim → packages/adapters-runtime/src/tenant-connection-manager-impl.ts
│   └── types.ts                    copied → packages/adapters-runtime/src/types.ts
├── utils/
│   ├── log-stream.ts               shim → packages/adapters-runtime/src/log-stream.ts
│   ├── metrics-store.ts            shim → packages/adapters-runtime/src/metrics-store.ts
│   ├── webhook.ts                  shim → packages/adapters-runtime/src/webhook.ts
│   └── ip-utils.ts                 shim → packages/adapters-runtime/src/ip-utils.ts
├── server.ts                       shim (re-exports composition root)
├── application/
│   └── (empty — tenant-service.ts deleted)
└── prisma/
    └── (Prisma schema — never moves)
```

## Deleted Files

- `src/admin/admin-api.ts` — replaced by `packages/http/src/admin-api-handler.ts`
- `src/admin/routes.ts` — replaced by `packages/server-fastify/src/routes/admin.routes.ts`
- `src/application/tenant-service.ts` — replaced by `packages/core/src/application/tenant/*`
- `create-tenant.ts` (root dev script) — removed
- `tests/admin-api.snapshot.test.ts` — removed (old monolith handler snapshot)
- `tests/__snapshots__/admin-api.snapshot.test.ts.snap` — removed

## P07 Plan (shim deletion)

Once all external tooling (Replit `.replit`, CI scripts, migration scripts) are confirmed
to use `apps/api/src/main.ts` as entry point, the shim files in `src/` can be deleted:

1. Delete all `src/utils/*.ts` shims
2. Delete `src/admin/auth.ts` shim
3. Delete `src/multi-tenant/*.ts` shims
4. Delete `src/env.ts` and `src/config/` shims
5. Delete `src/server.ts` shim
6. Remove `src` from `tsconfig.json` `include` array
