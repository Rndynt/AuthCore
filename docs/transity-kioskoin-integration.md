# AuthCore Integration Playbook for Transity & KiosKoin

This guide describes how to deploy AuthCore, provision tenants, and connect the Transity and KiosKoin SaaS projects so they can rely on AuthCore for identity. It combines the multi-tenant primitives provided by AuthCore with the structure of each downstream application.

## 1. Prepare AuthCore

1. **Set core environment variables** — `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `TRUSTED_ORIGINS`, `DATABASE_URL`, and optionally `ADMIN_API_KEY`. Use a unique secret in production because AuthCore refuses to boot if `NODE_ENV=production` still uses the default development secret.【F:README.md†L27-L109】【F:src/env.ts†L1-L45】
2. **Install dependencies and generate Prisma artifacts.** Run `npm install`, `npm run prisma:gen`, `npx @better-auth/cli generate prisma --yes`, and `npm run prisma:deploy` (or `npm run prisma:migrate` for local iteration).【F:README.md†L111-L153】
3. **Start the service** with `npm run dev` for development or the Netlify build target for production deployment. Ensure `TRUSTED_ORIGINS` includes the SaaS frontends so cookie credentials work end-to-end.【F:README.md†L155-L219】
4. **Enable optional admin APIs** by setting `ADMIN_API_KEY` when you need tenant lifecycle automation or metrics. Leave it unset otherwise.【F:MULTI_TENANT_USAGE.md†L81-L116】
   - When deploying the bundled admin UI on Netlify, keep `NEXT_PUBLIC_API_URL` pointed at `/.netlify/functions`. The client automatically rewrites this value to `/.netlify/functions/auth` so login and management requests reach the Netlify function without manual URL tweaks.【F:admin-ui/lib/api-client.ts†L1-L28】【F:netlify.toml†L1-L34】

## 2. Provision Tenants

AuthCore ships with a tenant registry stored in `public.tenants` and a connection manager that multiplexes Prisma clients per schema.

1. **Create tenant entries** using the Admin API (or directly through `TenantService#createTenant`) with canonical IDs, slugs, and schema names. The service validates identifiers, inserts the registry record, provisions schema clones, and registers the tenant in memory.【F:src/admin/tenant-service.ts†L1-L111】
2. **Handle lifecycle events** (activate, suspend, delete) via the tenant service. Each action updates the registry and refreshes the in-memory map so API traffic reflects the new status immediately.【F:src/admin/tenant-service.ts†L112-L220】
3. **Verify availability** by calling `/me` or `/api/auth/*` with the `X-Tenant-Id` header, a tenant subdomain, or the `/tenant/{id}` prefix. All three resolution paths are accepted by the middleware.【F:MULTI_TENANT_USAGE.md†L17-L70】
4. **Monitor usage** from `/admin/stats` when an admin API key is configured. The endpoint now returns:
   - `generatedAt` → ISO timestamp showing when the snapshot was produced.
   - `connections` → the existing connection manager telemetry per tenant, including pool stats and idle TTL metadata.
   - `requests` → aggregate counters (`totalResponses`, per-method, per-status) and a latency histogram with millisecond buckets (`50`, `100`, `250`, `500`, `1000`, `2500`, `5000`, `+Inf`).
   Use the histogram to spot latency regressions and the status buckets to surface systemic failures quickly.【F:src/server.ts†L197-L222】【F:src/utils/request-metrics.ts†L1-L120】【F:src/multi-tenant/connection-manager.ts†L300-L343】

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

The `main-serverless` branch of KiosKoin combines an Express application (`server/`) with Netlify function wrappers (`netlify/functions/api.ts`). The codebase currently embeds Better Auth directly; the steps below externalise that logic so AuthCore supplies all identity features.

### 5.1 Backend (Express + Netlify wrapper)

1. **Introduce AuthCore environment variables** in Netlify/production and `.env` files:
   - `AUTHCORE_BASE_URL` → the public URL of the AuthCore deployment (e.g., `https://authcore.example.com`).
   - `AUTHCORE_TENANT_ID` → `kioskoin` (or another tenant ID if you operate staging/preview stacks).
   - `AUTHCORE_ADMIN_API_KEY` (optional) → required only for automated tenant provisioning or admin API calls.
   - Re-export these variables from Netlify to Express by adding them to `netlify.toml` or the site configuration so `process.env` exposes them during function execution.
2. **Replace the in-repo Better Auth instance** in `server/lib/auth.ts` with a lightweight AuthCore client. Create a helper that wraps `fetch` so other modules can request AuthCore data without duplicating boilerplate:
   ```ts
   const baseUrl = new URL(process.env.AUTHCORE_BASE_URL!);

   async function authcore(path: string, init: RequestInit = {}) {
     const url = new URL(path, baseUrl);
     const res = await fetch(url, {
       ...init,
       headers: {
         "X-Tenant-Id": process.env.AUTHCORE_TENANT_ID!,
         ...init.headers,
       },
       credentials: "include",
     });

     if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
     return res.json();
   }

   export async function requireSession(headers: IncomingHttpHeaders) {
     return authcore("/me", { headers });
   }

   export async function createApiKey(name: string) {
     return authcore("/api/auth/api-key/create", {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         "X-Admin-Api-Key": process.env.AUTHCORE_ADMIN_API_KEY!,
       },
       body: JSON.stringify({ name }),
     });
   }
   ```
   Import `IncomingHttpHeaders` from `node:http` (or `http` in CommonJS builds). This keeps the AuthCore integration contained in one module while exposing simple helper functions to the rest of the codebase.
3. **Proxy `/api/auth/*` traffic to AuthCore**. In `server/app.ts`, remove `toNodeHandler(auth)` and wire an HTTP proxy that forwards cookies, bearer tokens, and the tenant header:
   ```ts
   import { createProxyMiddleware } from "http-proxy-middleware";

   app.use(
     "/api/auth",
     createProxyMiddleware({
       target: process.env.AUTHCORE_BASE_URL!,
       changeOrigin: true,
       pathRewrite: { "^/api/auth": "/api/auth" },
       onProxyReq(proxyReq, req) {
         proxyReq.setHeader("x-tenant-id", process.env.AUTHCORE_TENANT_ID!);
         if (req.headers.authorization) {
           proxyReq.setHeader("authorization", req.headers.authorization);
         }
       },
     }),
   );
   ```
   Reuse the same proxy in the Netlify function handler (`netlify/functions/api.ts`) because it instantiates the Express app on demand.
4. **Validate sessions via AuthCore** in protected routes. Update the `requireAdmin` middleware in `server/routes.ts` to call `requireSession(req.headers)` (from the helper above) and perform the existing role checks on the returned user. Remove the `auth.api.getSession` usage and delete the obsolete Better Auth import.
5. **Review other Better Auth imports** such as `insertBetterAuthUserSchema` usage. For administrative flows (e.g., seeding users, bot registration), call AuthCore’s admin API endpoints instead of writing directly to Better Auth tables. For example, replace direct `db.insert(user)` calls with `authcore.admin.createUser` so AuthCore owns credential hashing.

### 5.2 Frontend (React client)

1. **Point the React auth client to AuthCore** by rewriting `client/src/lib/auth-client.ts` to include the external base URL and tenant header:
   ```ts
   export const authClient = createAuthClient({
     baseURL: `${import.meta.env.VITE_API_BASE_URL ?? ""}/api/auth`,
     fetchOptions: {
       credentials: "include",
       headers: {
         "X-Tenant-Id": import.meta.env.VITE_AUTHCORE_TENANT_ID,
       },
     },
   });
   ```
   Populate `VITE_API_BASE_URL` with the Netlify function endpoint and `VITE_AUTHCORE_TENANT_ID` with `kioskoin`.
2. **Adjust API helpers** (`client/src/lib/queryClient.ts`, any direct `fetch` calls) so every request destined for AuthCore includes `credentials: "include"` and the `X-Tenant-Id` header. When calling through the Express backend, the server can inject the header, so the frontend only needs to send cookies.
3. **Update onboarding and admin flows** (e.g., pages under `client/src/pages/auth` or any admin dashboard components) to use AuthCore’s endpoints for sign-in/out, password resets, and session reads. The component interfaces remain compatible because AuthCore mirrors Better Auth’s REST contract.

### 5.3 Serverless deployment checklist

- Ensure the Netlify build image includes the new dependency (`http-proxy-middleware` or your chosen proxy utility`).
- Add the AuthCore environment variables to both Netlify build and runtime contexts so `server/app.ts` and static builds read them consistently.
- Redeploy after removing Better Auth migrations from `server/generate-auth-schema.ts`; the AuthCore-managed schema renders those scripts unnecessary.

Following these steps migrates the existing embedded Better Auth setup to AuthCore while preserving KiosKoin’s Express routing, Telegram bot flows, and Netlify deployment model.

## 6. Operational Checklist

- **Tenant health**: periodically hit `/admin/stats` to confirm each tenant’s connection metadata and session counts.【F:src/admin/tenant-service.ts†L221-L278】
- **Secret hygiene**: rotate `BETTER_AUTH_SECRET` and `ADMIN_API_KEY` regularly; AuthCore already enforces a non-default secret in production builds.【F:src/env.ts†L31-L43】
- **Onboarding automation**: script `createTenant` calls for future SaaS projects so schema provisioning completes synchronously before handing credentials to product teams.【F:src/admin/tenant-service.ts†L64-L111】

---

### Change log

- 2025-11-10 — Initial integration runbook drafted for Transity and KiosKoin.
- 2025-11-11 — Expanded KiosKoin guidance with repository-specific migration steps.
- 2025-11-12 — Clarified Netlify admin UI routing so login requests reach the AuthCore function.
