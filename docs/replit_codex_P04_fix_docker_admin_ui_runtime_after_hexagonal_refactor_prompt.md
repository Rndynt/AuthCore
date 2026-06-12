# Replit/Codex Prompt — P04 Fix Docker/Admin UI Runtime After Hexagonal Refactor

Repository:

```txt
Rndynt/Realmio
```

Branch:

```txt
multi-tenant
```

Context:

P03 commit:

```txt
ba64ed4dd40b7e807b271a9e1c5f43be3671a999
fix: restore api compatibility after hexagonal wiring
```

P03 fixed compile/test/API compatibility regressions. However, Docker/Admin UI runtime is still inconsistent and not production-safe.

## Critical Production Issue

### Current mismatch

`admin-ui/next.config.ts` uses:

```ts
output: 'standalone'
```

`admin-ui/package.json` builds with:

```json
"build": "next build"
```

So a successful build produces Next `.next` standalone/server assets, **not** `admin-ui/out`.

But the root `Dockerfile` still does:

```dockerfile
COPY --from=build /app/admin-ui/out ./admin-ui/out
```

And `packages/server-fastify/src/routes/static-ui.routes.ts` currently looks for:

```ts
const distPath = join(process.cwd(), 'dist', 'public');
```

That means:

1. Docker image build can fail because `/app/admin-ui/out` does not exist.
2. Even if Docker build is changed to avoid failure, Fastify will not serve the real Admin UI because it looks in `dist/public`.
3. The report currently admits a placeholder is served when static build is missing, which is not acceptable for production.

## Decision Required

Use **one** clear production strategy. Do not leave mixed SSR/static behavior.

Recommended for current API-service Docker runtime:

### Option A — Static export served by Fastify

Use this if the Admin UI can run as a static SPA against same-origin API.

Implement:

1. Change `admin-ui/next.config.ts` to static export mode:

```ts
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};
```

2. Remove Next rewrites from static export config. Static export cannot rely on server-side Next rewrites. The UI should call same-origin API through the SDK/client base URL logic.

3. Ensure `npm --prefix admin-ui run build` produces:

```txt
admin-ui/out
```

4. Update Dockerfile to copy it into the runtime path expected by Fastify:

```dockerfile
COPY --from=build /app/admin-ui/out ./dist/public
```

5. Update `packages/server-fastify/src/routes/static-ui.routes.ts` to serve:

```ts
const distPath = join(process.cwd(), 'dist', 'public');
```

This can remain if Docker copies to that path.

6. Register SPA fallback so `/admin`, `/admin/*`, and dashboard routes serve `index.html`/appropriate static export files, while API paths are never intercepted.

7. Remove placeholder production behavior. In production, if static files are missing, fail loudly or return a clear 500 with actionable message. Placeholder is allowed only in development.

### Option B — Separate Next SSR service

Use this only if Admin UI requires SSR/standalone server.

Implement:

1. Keep `output: 'standalone'`.
2. Docker must copy:

```txt
admin-ui/.next/standalone
admin-ui/.next/static
admin-ui/public
```

3. Runtime must either:
   - run two processes correctly with a process manager, or
   - split into two Docker services: API and Admin UI.

4. Remove Fastify static serving claim for Admin UI, or keep only API service.

Do **not** choose Option B unless you fully wire the runtime process/service model. A single `CMD node dist/apps/api/src/main.js` does not run Next standalone UI.

## Required Implementation

Prefer Option A unless there is a confirmed blocker.

### 1. Fix `admin-ui/next.config.ts`

Make the Admin UI build produce `admin-ui/out` via static export, or fully implement Option B.

### 2. Fix Dockerfile

If Option A:

```dockerfile
COPY --from=build /app/admin-ui/out ./dist/public
```

Remove any copy from `/app/admin-ui/out` to `./admin-ui/out` unless Fastify actually serves from that path.

### 3. Fix static serving route

Update:

```txt
packages/server-fastify/src/routes/static-ui.routes.ts
```

Requirements:

- Serve static files from `dist/public` in production.
- Do not intercept:

```txt
/api/*
/admin/api
/admin/api/*
/admin/auth/*
/admin/log-stream
/tenant/*
/legacy/*
/dev/*
/health
/healthz
/ready
/api/health
```

- `/admin` and `/admin/*` should serve Admin UI.
- `/` should optionally redirect to `/admin` or serve Admin UI landing if current app expects root dashboard.
- Missing production static files should return 500 with message like:

```json
{"error":"STATIC_UI_NOT_BUILT","message":"Admin UI static files not found at dist/public. Run npm run build:admin-ui and rebuild the Docker image."}
```

### 4. Fix report

Update:

```txt
docs/clean-architecture-refactor-report.md
```

Add section:

```txt
P04 Docker/Admin UI Runtime Fixes
```

Include:

- Which option was selected: static export or separate Next SSR service.
- Docker runtime path.
- Fastify static route behavior.
- Build command results.
- Docker build result if runnable in the environment.
- Remaining limitations.

### 5. Add a test

Add a static route guard test or boundary-style test that verifies the static route exclusion list contains API/auth/tenant/legacy paths and does not swallow API endpoints.

At minimum, add a unit test for a helper such as:

```ts
shouldServeAdminUi(pathname: string): boolean
```

Expected:

```ts
shouldServeAdminUi('/admin') === true
shouldServeAdminUi('/admin/settings') === true
shouldServeAdminUi('/') === true or redirect behavior documented
shouldServeAdminUi('/api/auth/sign-in/email') === false
shouldServeAdminUi('/admin/api/tenants') === false
shouldServeAdminUi('/admin/auth/sign-in/email') === false
shouldServeAdminUi('/tenant/acme/api/auth/get-session') === false
shouldServeAdminUi('/legacy/auth/get-session') === false
shouldServeAdminUi('/healthz') === false
```

## Acceptance Criteria

P04 is complete only if all are true:

1. Dockerfile no longer copies a non-existent `admin-ui/out` unless `next build` actually produces it.
2. Admin UI build output path matches Fastify static serving path.
3. Production no longer serves placeholder Admin UI silently when static files are missing.
4. `/admin` and `/admin/*` serve Admin UI assets/fallback correctly.
5. API/auth/tenant/legacy/health/dev endpoints are not swallowed by SPA fallback.
6. `npm run check` passes.
7. `npm test` passes.
8. `npm run build` passes.
9. Docker build passes or the report documents the exact environment blocker and command output.
10. `docs/clean-architecture-refactor-report.md` is updated honestly.

## Commit Required

Commit all changes with:

```txt
fix: align docker admin ui runtime
```
