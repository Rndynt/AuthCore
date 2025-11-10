# AuthCore Integration Playbook for Transity & KiosKoin

This guide describes how to deploy AuthCore, provision tenants, and connect the Transity and KiosKoin SaaS projects so they can rely on AuthCore for identity. It combines the multi-tenant primitives provided by AuthCore with the structure of each downstream application.

## 1. Prepare AuthCore

1. **Set core environment variables** — `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `TRUSTED_ORIGINS`, `DATABASE_URL`, and optionally `ADMIN_API_KEY`. Use a unique secret in production because AuthCore refuses to boot if `NODE_ENV=production` still uses the default development secret.【F:README.md†L27-L109】【F:src/env.ts†L1-L45】
2. **Install dependencies and generate Prisma artifacts.** Run `npm install`, `npm run prisma:gen`, `npx @better-auth/cli generate prisma --yes`, and `npm run prisma:deploy` (or `npm run prisma:migrate` for local iteration).【F:README.md†L111-L153】
3. **Start the service** with `npm run dev` for development or the Netlify build target for production deployment. Ensure `TRUSTED_ORIGINS` includes the SaaS frontends so cookie credentials work end-to-end.【F:README.md†L155-L219】
4. **Enable optional admin APIs** by setting `ADMIN_API_KEY` when you need tenant lifecycle automation or metrics. Leave it unset otherwise.【F:MULTI_TENANT_USAGE.md†L81-L116】

## 2. Provision Tenants

AuthCore ships with a tenant registry stored in `public.tenants` and a connection manager that multiplexes Prisma clients per schema.

1. **Create tenant entries** using the Admin API (or directly through `TenantService#createTenant`) with canonical IDs, slugs, and schema names. The service validates identifiers, inserts the registry record, provisions schema clones, and registers the tenant in memory.【F:src/admin/tenant-service.ts†L1-L111】
2. **Handle lifecycle events** (activate, suspend, delete) via the tenant service. Each action updates the registry and refreshes the in-memory map so API traffic reflects the new status immediately.【F:src/admin/tenant-service.ts†L112-L220】
3. **Verify availability** by calling `/me` or `/api/auth/*` with the `X-Tenant-Id` header, a tenant subdomain, or the `/tenant/{id}` prefix. All three resolution paths are accepted by the middleware.【F:MULTI_TENANT_USAGE.md†L17-L70】
4. **Monitor usage** from `/admin/stats` when an admin API key is configured; the response includes per-tenant connection telemetry supplied by the connection manager.【F:src/multi-tenant/connection-manager.ts†L1-L113】【F:src/admin/tenant-service.ts†L221-L278】

### Recommended tenant identifiers

| SaaS | Tenant ID | Tenant Slug | Schema | Notes |
| --- | --- | --- | --- | --- |
| Transity | `transity` | `transity` | `tenant_transity` | Frontend + Express backend run on the same host; set `X-Tenant-Id` header on all AuthCore calls. |
| KiosKoin | `kioskoin` | `kioskoin` | `tenant_kioskoin` | Map the serverless function/project environment to this tenant when dispatching AuthCore requests. |

## 3. Configure CORS and trusted origins

Include the SaaS domains and localhost ports used by Transity and KiosKoin in `TRUSTED_ORIGINS` so browser fetches with `credentials: "include"` can persist AuthCore cookies. Regenerate the environment variable whenever a new preview domain is introduced.【F:src/env.ts†L17-L43】

## 4. Integrate Transity

Transity’s repository uses an Express backend (`server/index.ts`) alongside a React/TanStack Query frontend (`client/src`). The following steps attach AuthCore authentication end-to-end.

### 4.1 Backend (Express API)

1. **Add AuthCore configuration**: introduce environment variables such as `AUTHCORE_BASE_URL`, `AUTHCORE_TENANT_ID`, and optionally `AUTHCORE_ADMIN_API_KEY` in Transity. Load them in `server/index.ts` alongside existing Express bootstrap logic.
2. **Create an authentication middleware** in `server/index.ts` (before `registerRoutes`) that forwards incoming cookies or bearer tokens to AuthCore’s `/me` endpoint. The middleware should:
   - Pass through `Cookie` and `Authorization` headers from the client.
   - Append `X-Tenant-Id: transity` (or use the subdomain/path variant if you expose multiple tenants from one deployment).
   - Reject requests when AuthCore responds with `401` or the tenant status is suspended.
3. **Protect API routes** by applying the middleware either globally (`app.use(protectedMiddleware)`) or selectively within `registerRoutes` depending on which endpoints need authentication. Since `registerRoutes` wires every `/api/*` resource controller, applying the middleware to `/api` ensures comprehensive coverage.
4. **Handle service-to-service calls**: for schedulers or background jobs that need elevated access, request an AuthCore API key via `/api/auth/api-key/create` and cache it in Transity’s secure configuration. Supply it through the `x-api-key` header when invoking protected endpoints from cron jobs or other services.【F:INTEGRATION_GUIDE.md†L1-L112】【F:MULTI_TENANT_USAGE.md†L52-L80】

### 4.2 Frontend (React client)

1. **Reuse the existing `credentials: "include"` fetch wrapper** (`client/src/lib/queryClient.ts`) so AuthCore session cookies flow automatically. Point AuthCore requests to the deployed domain or a reverse proxy hosted alongside the Express API.
2. **Implement login & logout screens** that POST to AuthCore’s `/api/auth/sign-in/email` and `/api/auth/sign-out`. Store the resolved user profile from `/me` in global state (TanStack Query or context) to hydrate the UI.【F:INTEGRATION_GUIDE.md†L13-L79】【F:MULTI_TENANT_USAGE.md†L33-L70】
3. **Handle unauthorized responses** by leveraging the existing `on401` switch in `getQueryFn` to redirect users to the login page when AuthCore sessions expire.

### 4.3 Multitenant routing

If Transity will later host multiple customers, surface the tenant slug on the frontend (e.g., via domain or path) and pass it through the API to AuthCore by overriding the default `X-Tenant-Id` header. The connection manager resolves IDs and slugs interchangeably, so an end-user-friendly slug is safe to expose.【F:src/multi-tenant/connection-manager.ts†L39-L93】

## 5. Integrate KiosKoin

The `main-serverless` branch of KiosKoin is private, so automated inspection was not possible. The steps below outline how to stitch AuthCore into a serverless deployment once repository access is available.

1. **Mirror the AuthCore environment variables** (`AUTHCORE_BASE_URL`, `AUTHCORE_TENANT_ID`, `TRUSTED_ORIGINS`) inside the serverless platform (e.g., Netlify, Vercel, AWS Lambda). Align the tenant ID with the `kioskoin` registry record provisioned earlier.
2. **Wrap serverless handlers** so incoming requests proxy authentication to AuthCore before executing business logic. On Netlify/Vercel, this usually means creating a middleware function that fetches `/me` with the original cookies/headers plus `X-Tenant-Id`.
3. **For static frontends**, configure the build to send AuthCore requests through the serverless API layer (to avoid CORS drift) and ensure `credentials: "include"` is enabled when fetching from the browser.【F:README.md†L155-L219】
4. **Admin and provisioning workflows** follow the same tenant service calls described earlier. Once repository access is available, replicate the Express middleware pattern (or its framework-specific equivalent) within each function entrypoint.

> ⚠️ *Action item*: grant repository access or share architectural details for `KiosKoinCore` to produce a code-level integration patch.

## 6. Operational Checklist

- **Tenant health**: periodically hit `/admin/stats` to confirm each tenant’s connection metadata and session counts.【F:src/admin/tenant-service.ts†L221-L278】
- **Secret hygiene**: rotate `BETTER_AUTH_SECRET` and `ADMIN_API_KEY` regularly; AuthCore already enforces a non-default secret in production builds.【F:src/env.ts†L31-L43】
- **Onboarding automation**: script `createTenant` calls for future SaaS projects so schema provisioning completes synchronously before handing credentials to product teams.【F:src/admin/tenant-service.ts†L64-L111】

---

### Change log

- 2025-11-10 — Initial integration runbook drafted for Transity and KiosKoin.
