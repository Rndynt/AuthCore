# Replit/Codex Prompt — P05 Production Runtime Smoke Test & Deploy Alignment

Repository:

```txt
Rndynt/Realmio
```

Branch:

```txt
multi-tenant
```

Context:

P04 commit:

```txt
6073932c1dc0455e267535cc118f31bf22ccaae1
fix: docker admin-ui static export and runtime serving
```

P04 aligned the app to **Option A**:

```txt
Admin UI = static export
Fastify = serves dist/public at /admin
Docker = single runtime container running node dist/apps/api/src/main.js
```

Now P05 must validate and align all production deployment/runtime surfaces. Do not refactor business logic in this phase. This phase is about runtime correctness, Docker/Compose/docs consistency, and smoke tests.

## Critical Gaps Found After P04

### 1. `docker-compose.yml` is still the old two-service model

Current compose still has:

```yaml
services:
  api:
    ports:
      - "127.0.0.1:4000:4000"

  admin-ui:
    build:
      context: ./admin-ui
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - NEXT_INTERNAL_API_URL=http://api:4000
```

This is invalid after P04.

P04 production model is a single Fastify runtime:

```txt
node dist/apps/api/src/main.js
```

It serves both:

```txt
/admin static UI
/admin/api/* Admin API
/admin/auth/* Admin Auth
/api/auth/* Tenant Auth
/tenant/:tenantId/api/auth/* Explicit tenant auth
/legacy/auth/* Deprecated auth compatibility
```

The compose file must be updated accordingly.

### 2. `docs/DEPLOY_VPS_DOCKER.md` is outdated

The deploy doc still describes:

```txt
API on port 4000
Admin UI on port 3000
admin-ui/Dockerfile
Next output: standalone
Next server runtime
Nginx routes / to Next and /admin to backend
```

This contradicts P04.

After P04, docs must describe:

```txt
One Docker service
Fastify on port 5000 by default
Admin UI static export copied to dist/public
/admin served by Fastify
Nginx/Coolify points to the single Fastify service
```

### 3. Need real production runtime smoke validation

P04 report confirms check/test/admin-ui build, but P05 must validate the actual production runtime surface:

```txt
docker build
docker run
healthcheck
/admin static file serving
/admin/_next/static asset serving
API routes not swallowed by SPA fallback
```

## Required Implementation

### 1. Update `docker-compose.yml` to single-service model

Replace the current two-service compose model with a single `api` service.

Expected shape:

```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: realmio_api
    restart: unless-stopped
    ports:
      - "127.0.0.1:5000:5000"
    env_file:
      - .env
    environment:
      NODE_ENV: production
      PORT: 5000
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - realmio_net

networks:
  realmio_net:
    driver: bridge
```

Rules:

- Remove `admin-ui` service entirely.
- Remove `NEXT_INTERNAL_API_URL` usage from compose.
- Do not reference `admin-ui/Dockerfile`.
- Do not expose port 3000.
- Do not map API to `4000` unless the app config is explicitly changed to `PORT=4000`. Prefer `5000` because Dockerfile exposes 5000 and root scripts use current API default.

### 2. Update `docs/DEPLOY_VPS_DOCKER.md`

Rewrite the doc to match the current P04 runtime model.

Required doc content:

```txt
Architecture:
Internet/Cloudflare/Nginx/Coolify
  -> single Realmio container on port 5000
      -> Fastify API
      -> Admin UI static files at /admin
```

Must remove or correct all outdated instructions that say:

```txt
Admin UI separate service on port 3000
Next standalone runtime
admin-ui/Dockerfile production server
output: 'standalone'
NEXT_INTERNAL_API_URL
API port 4000 as the default
Nginx / proxying to Next server
```

New route map:

```txt
/                      -> 302 /admin/
/admin                 -> Admin UI static
/admin/*               -> Admin UI static fallback, except reserved routes
/admin/auth/*          -> Admin auth API
/admin/api             -> Admin API root
/admin/api/*           -> Admin API
/admin/log-stream      -> SSE log stream
/api/auth/*            -> Tenant auth via header/subdomain
/tenant/:tenantId/api/auth/* -> Tenant auth via path
/legacy/auth/*         -> Deprecated compatibility auth
/healthz               -> Healthcheck
/ready                 -> Readiness
/api/health            -> Health alias
/dev/*                 -> Dev-only routes when enabled
```

Include Coolify settings:

```txt
Build type: Dockerfile
Dockerfile path: Dockerfile
Exposed/internal port: 5000
Healthcheck path: /healthz
No separate Admin UI service
No Next.js preset for admin-ui
```

Include Nginx reverse proxy example for one upstream:

```nginx
location / {
  proxy_pass http://127.0.0.1:5000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

### 3. Add production smoke test script

Add a script:

```txt
scripts/smoke-production-runtime.sh
```

It should be executable and support configurable base URL:

```bash
BASE_URL=${BASE_URL:-http://localhost:5000}
```

Required checks:

```txt
GET /healthz                         expect 200
GET /ready                           expect 200 or 503 with JSON readiness body documented
GET /                              expect 302 to /admin/ OR 200 if chosen behavior changed
GET /admin/                          expect 200 text/html
GET /admin/_next/static/...          optional if a real asset path can be discovered from index.html
GET /admin/api                       expect not HTML SPA; likely 401/403/404 JSON depending auth
GET /admin/api/tenants               expect not HTML SPA; likely 401/403 JSON depending auth
GET /admin/auth/get-session          expect not HTML SPA
GET /api/auth/get-session            without tenant should return TENANT_REQUIRED JSON, not HTML
GET /tenant/__missing__/api/auth/get-session expect JSON error, not HTML
GET /legacy/auth/get-session         expect JSON error/deprecation behavior, not HTML
```

The script should fail if any reserved API route returns HTML Admin UI by mistake.

Use only portable shell + curl + grep/sed. Do not require jq unless you also document it.

### 4. Add npm script for smoke test

Update root `package.json`:

```json
"smoke:prod": "bash scripts/smoke-production-runtime.sh"
```

Optionally add:

```json
"docker:build": "docker build -t realmio:local ."
```

Do not break existing scripts.

### 5. Add or update tests for compose/deploy alignment

Add a lightweight Node test:

```txt
tests/deployment-config.test.ts
```

Use `node:test` and `node:assert/strict`.

Test these invariants by reading files as text:

```txt
docker-compose.yml must not contain "admin-ui:" service
docker-compose.yml must not contain "3000:3000"
docker-compose.yml must not contain "NEXT_INTERNAL_API_URL"
docker-compose.yml should reference port 5000
Dockerfile should copy admin-ui/out to dist/public
Dockerfile should CMD node dist/apps/api/src/main.js
admin-ui/next.config.ts should contain output: 'export'
admin-ui/next.config.ts should not contain output: 'standalone'
docs/DEPLOY_VPS_DOCKER.md should not recommend Next standalone or separate admin-ui service
```

### 6. Run verification commands

Run and fix failures:

```txt
npm run check
npm test
npm run build
npm --prefix admin-ui run build
docker build -t realmio:local .
```

If Docker cannot run in the environment, document exact blocker and still ensure Dockerfile/compose/docs are aligned by static tests.

If Docker can run, also run:

```txt
docker run --rm -p 5000:5000 --env-file .env realmio:local
BASE_URL=http://localhost:5000 npm run smoke:prod
```

If `.env` cannot be provided in the environment, document the blocker and provide exact command for local/VPS.

### 7. Update report

Update:

```txt
docs/clean-architecture-refactor-report.md
```

Add section:

```txt
Phase 5 (P05) — Production Runtime Smoke & Deploy Alignment
```

Required content:

```txt
- docker-compose changed to single-service model
- deploy docs updated to Option A static Admin UI via Fastify
- smoke script added
- deployment config test added
- command results:
  npm run check
  npm test
  npm run build
  npm --prefix admin-ui run build
  docker build result or exact blocker
  smoke:prod result or exact blocker
- remaining limitations
```

## Acceptance Criteria

P05 is complete only if all are true:

1. `docker-compose.yml` uses one service only for Realmio runtime.
2. `docker-compose.yml` removes `admin-ui` service.
3. `docker-compose.yml` removes port 3000.
4. `docker-compose.yml` uses port 5000 consistently unless there is a deliberate documented change.
5. `docker-compose.yml` healthcheck points to `/healthz` on the runtime port.
6. `docs/DEPLOY_VPS_DOCKER.md` no longer recommends Next standalone Admin UI.
7. `docs/DEPLOY_VPS_DOCKER.md` no longer recommends separate Admin UI service on port 3000.
8. `docs/DEPLOY_VPS_DOCKER.md` documents single Fastify service serving API + Admin UI static export.
9. `scripts/smoke-production-runtime.sh` exists and checks core runtime routes.
10. Root `package.json` has `smoke:prod` script.
11. `tests/deployment-config.test.ts` exists and passes.
12. `npm run check` passes.
13. `npm test` passes.
14. `npm run build` passes.
15. `docker build -t realmio:local .` passes, or exact environment blocker is documented.
16. If Docker runtime can be started, `npm run smoke:prod` passes against the container.
17. `docs/clean-architecture-refactor-report.md` is updated honestly.

## Commit Required

Commit all changes with:

```txt
chore: align production deployment runtime
```
