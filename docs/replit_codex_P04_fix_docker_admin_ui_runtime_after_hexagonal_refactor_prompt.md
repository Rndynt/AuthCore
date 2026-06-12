# Replit/Codex Prompt — P04 Option A Only: Static Admin UI Served by Fastify

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

P03 fixed compile/test/API compatibility regressions. This P04 must fix the remaining production runtime mismatch for Docker/Admin UI.

## Non-Negotiable Decision

Use **Option A only**:

```txt
Admin UI = static export
Fastify = serves Admin UI static files from dist/public
Docker = single API container running node dist/apps/api/src/main.js
```

Do **not** implement Option B.

Do **not** keep Next standalone/SSR runtime.

Do **not** run a separate Next server.

Do **not** use a process manager to run both Fastify and Next.

Do **not** leave mixed static/SSR behavior.

The final production model must be:

```txt
Browser
  -> Fastify API service
      -> /admin and /admin/*       serve Admin UI static export
      -> /admin/api and /admin/api/* serve Admin API
      -> /admin/auth/*            serve Admin Better Auth routes
      -> /api/auth/*              serve tenant auth routes
      -> /tenant/:tenantId/api/auth/* serve explicit tenant auth routes
      -> /legacy/auth/*           serve deprecated compatibility auth route
```

## Current Production Bug

`admin-ui/next.config.ts` currently uses:

```ts
output: 'standalone'
```

That produces Next standalone/server assets under `.next`, not `admin-ui/out`.

But the Dockerfile currently copies:

```dockerfile
COPY --from=build /app/admin-ui/out ./admin-ui/out
```

And Fastify static route looks for:

```ts
const distPath = join(process.cwd(), 'dist', 'public');
```

This is broken because:

1. `admin-ui/out` is not produced by `output: 'standalone'`.
2. Docker copy path does not match Fastify static serving path.
3. Fastify can silently serve a placeholder instead of the real Admin UI.

## Required Implementation

### 1. Convert Admin UI to static export

Update:

```txt
admin-ui/next.config.ts
```

Required shape:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
```

Rules:

- Remove `output: 'standalone'`.
- Remove `rewrites()` from `next.config.ts`.
- Static export cannot rely on Next server rewrites.
- Admin UI must call the Realmio API through same-origin URLs using the SDK/client base URL logic.
- Do not use Next server-only runtime features in the Admin UI build path.

After this change, this command must produce:

```txt
admin-ui/out
```

Command:

```txt
npm --prefix admin-ui run build
```

### 2. Ensure Admin UI API client uses same-origin API

Verify:

```txt
admin-ui/lib/api-client.ts
```

Expected behavior:

- In browser, API base URL should be `window.location.origin`.
- It should call existing same-origin paths:

```txt
/admin/api/*
/admin/auth/*
/api/auth/*
/tenant/*
/legacy/*
```

- Do not depend on Next `rewrites()`.
- Do not hardcode Replit, Netlify, localhost-only, or deployment-specific URLs for production.

### 3. Fix Dockerfile

Update root `Dockerfile` so the runtime image copies Admin UI static export to the exact path Fastify serves.

Required runtime copy:

```dockerfile
COPY --from=build /app/admin-ui/out ./dist/public
```

Remove the old wrong copy:

```dockerfile
COPY --from=build /app/admin-ui/out ./admin-ui/out
```

The runtime `CMD` must remain the single Fastify API runtime:

```dockerfile
CMD ["node", "dist/apps/api/src/main.js"]
```

Do not add a Next server runtime command.

### 4. Fix Fastify static Admin UI serving

Update:

```txt
packages/server-fastify/src/routes/static-ui.routes.ts
```

Required behavior:

- Static root must be:

```ts
const distPath = join(process.cwd(), 'dist', 'public');
```

- In production, if `dist/public` or `dist/public/index.html` is missing, do **not** silently serve a placeholder.
- Return a clear `500` JSON error:

```json
{
  "error": "STATIC_UI_NOT_BUILT",
  "message": "Admin UI static files not found at dist/public. Run npm run build:admin-ui and rebuild the Docker image."
}
```

- Placeholder HTML is allowed only in development.
- `/` should redirect to `/admin` unless the current Admin UI requires root to render directly. Document the chosen behavior in the report.
- `/admin` and `/admin/*` should serve the static Admin UI.
- Static SPA fallback must not swallow API/auth/system routes.

### 5. Add a static route guard helper

Add/export a helper in the Fastify static route module or nearby module:

```ts
export function shouldServeAdminUi(pathname: string): boolean {
  // implementation
}
```

Expected results:

```ts
shouldServeAdminUi('/') === true
shouldServeAdminUi('/admin') === true
shouldServeAdminUi('/admin/') === true
shouldServeAdminUi('/admin/settings') === true
shouldServeAdminUi('/api/auth/sign-in/email') === false
shouldServeAdminUi('/admin/api') === false
shouldServeAdminUi('/admin/api/tenants') === false
shouldServeAdminUi('/admin/auth/sign-in/email') === false
shouldServeAdminUi('/admin/log-stream') === false
shouldServeAdminUi('/tenant/acme/api/auth/get-session') === false
shouldServeAdminUi('/legacy/auth/get-session') === false
shouldServeAdminUi('/dev/whoami') === false
shouldServeAdminUi('/health') === false
shouldServeAdminUi('/healthz') === false
shouldServeAdminUi('/ready') === false
shouldServeAdminUi('/api/health') === false
```

Suggested implementation rule:

```txt
Serve Admin UI only for:
- /
- /admin
- /admin/
- /admin/* except /admin/api, /admin/api/*, /admin/auth/*, /admin/log-stream

Do not serve Admin UI for:
- /api/*
- /tenant/*
- /legacy/*
- /dev/*
- /health
- /healthz
- /ready
```

### 6. Add tests

Add or update a Node test:

```txt
tests/static-ui-route-guard.test.ts
```

Use `node:test` and `node:assert/strict`, not Vitest.

Test all expected `shouldServeAdminUi()` cases listed above.

### 7. Verify Admin UI static export compatibility

Run:

```txt
npm --prefix admin-ui run build
```

If static export fails because a page uses unsupported Next features, fix the page/config so static export passes.

Examples of unsupported patterns to remove or rewrite:

- server-only route handlers relied on by the Admin UI.
- dynamic server rendering without static params.
- server-side redirects/rewrites.
- middleware requirement for admin pages.

For Realmio Admin UI, auth should be handled client-side by checking session through `/admin/auth/get-session` via SDK/API, not by server-rendering guards.

### 8. Update report

Update:

```txt
docs/clean-architecture-refactor-report.md
```

Add section:

```txt
P04 Docker/Admin UI Runtime Fixes
```

Required contents:

```txt
Selected option: Option A only — static export served by Fastify
Admin UI build output: admin-ui/out
Docker runtime static path: dist/public
Fastify static root: dist/public
Root behavior: / redirects to /admin OR / serves Admin UI directly
SPA fallback guard: API/auth/tenant/legacy/dev/health routes excluded
Command results:
  npm run check
  npm test
  npm run build
  docker build ... result if runnable
Remaining limitations, if any
```

Remove or correct any previous report language saying:

```txt
@fastify/static is not yet used in dev mode
placeholder page served instead
```

The final report must be honest and must not claim production Admin UI is fixed unless Docker/static paths actually align.

## Acceptance Criteria

P04 is complete only if all are true:

1. `admin-ui/next.config.ts` uses `output: 'export'`.
2. `admin-ui/next.config.ts` no longer uses `output: 'standalone'`.
3. `admin-ui/next.config.ts` no longer uses Next `rewrites()`.
4. `npm --prefix admin-ui run build` produces `admin-ui/out`.
5. Dockerfile copies `/app/admin-ui/out` to `./dist/public`.
6. Dockerfile does not copy `/app/admin-ui/out` to `./admin-ui/out`.
7. Dockerfile still runs only `node dist/apps/api/src/main.js`.
8. `packages/server-fastify/src/routes/static-ui.routes.ts` serves from `dist/public`.
9. Production missing static files returns `STATIC_UI_NOT_BUILT`, not placeholder HTML.
10. `/admin` and `/admin/*` serve Admin UI static fallback.
11. `/` redirects to `/admin` or serves Admin UI directly, and this is documented.
12. `/api/*`, `/admin/api`, `/admin/api/*`, `/admin/auth/*`, `/admin/log-stream`, `/tenant/*`, `/legacy/*`, `/dev/*`, `/health`, `/healthz`, `/ready`, `/api/health` are not swallowed by SPA fallback.
13. `shouldServeAdminUi()` exists and is tested.
14. `npm run check` passes.
15. `npm test` passes.
16. `npm run build` passes.
17. Docker build passes or the report documents the exact blocker and output.
18. `docs/clean-architecture-refactor-report.md` is updated honestly.

## Commit Required

Commit all changes with:

```txt
fix: align docker admin ui static runtime
```
