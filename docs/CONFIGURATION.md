# Configuration Reference

Realmio reads runtime configuration exclusively from environment variables. This document explains
how each value is used and how to combine them to activate single-tenant, multi-tenant, or hybrid
behaviour.

## Mode Selection

Two variables control the tenancy model:

| Variable | Values | Default | Purpose |
|----------|--------|---------|---------|
| `AUTH_MODE` | `single`, `multi` | `multi` | Chooses between a fixed tenant (`single`) or registry-driven tenants (`multi`). |
| `NESTED_TENANCY_ENABLED` | `true`, `false` | `false` | Enables sub-tenant managers when running in `multi` mode. Ignored for `single`. |

Use the decision tree below to decide which combination fits your deployment:

```
Need more than one tenant?
├─ No  → AUTH_MODE=single
└─ Yes → AUTH_MODE=multi
         │
         Require sub-tenants?
         ├─ No  → NESTED_TENANCY_ENABLED=false
         └─ Yes → NESTED_TENANCY_ENABLED=true
```

`src/config/auth-mode.ts` performs validation at startup and throws helpful errors when required
variables are missing.

## Core Environment Variables

| Category | Variable | Description | Default | Source |
|----------|----------|-------------|---------|--------|
| Networking | `PORT` | Fastify listen port. | `5000` | `src/env.ts` |
| URLs | `BETTER_AUTH_URL` | Public URL used by Better Auth for redirects and cookies. | `http://localhost:5000` or derived from `REPLIT_DEV_DOMAIN`. | `src/env.ts` |
| Secrets | `BETTER_AUTH_SECRET` | Token/cookie signing secret (>=24 chars). | Development fallback defined in `src/env.ts`. | `src/env.ts` |
| Database | `DATABASE_URL` | PostgreSQL connection string. | — | `src/env.ts`, Prisma clients |
| CORS | `TRUSTED_ORIGINS` | Comma-separated origins allowed by CORS middleware. | Development defaults include localhost variants. | `src/env.ts`, `src/server.ts` |
| Feature flags | `ENABLE_DEV_ENDPOINTS` | Enables `/dev/*` tooling routes when set to `true`. | `false` | `src/env.ts`, `src/dev.ts` |
| Feature flags | `DEV_ENDPOINTS_IP_ALLOWLIST` | Comma-separated IPs allowed to access `/dev/*` routes. Empty means no IP restriction. | — | `src/env.ts`, `src/dev.ts` |
| Feature flags | `DEV_ENDPOINTS_REQUIRE_ADMIN` | Require an admin role for all `/dev/*` routes (except JWKS). | `false` | `src/env.ts`, `src/dev.ts` |
| Mode | `AUTH_MODE` | See above. | `multi` | `src/config/auth-mode.ts` |
| Mode | `NESTED_TENANCY_ENABLED` | See above. | `false` | `src/config/auth-mode.ts` |
| Single mode | `TENANT_ID` | Required when `AUTH_MODE=single`; identifies the fixed tenant. | — | `src/config/auth-mode.ts` |
| Single mode | `TENANT_SCHEMA` | Overrides the schema name used in single-tenant mode. | `public` | `src/config/auth-mode.ts` |

### Generating Secrets

Use OpenSSL (or your preferred password manager) to create a strong secret for
`BETTER_AUTH_SECRET`:

```bash
openssl rand -base64 32
```

Store the generated value securely; it signs all admin and tenant sessions.

## Admin Authentication

Admin API routes use the Better Auth admin session cookie. Authenticate through the `/admin/auth/*`
endpoints to establish an admin session, then call `/admin/api/*`, `/admin/tenants`, or
`/admin/stats` with the same cookie. There is no API-key based admin auth flow; protect the admin
surface with private networking, VPNs, or an internal-only domain.

## Example Configurations

### Single-Tenant Instance

```bash
AUTH_MODE=single
TENANT_ID=pos
TENANT_SCHEMA=public
BETTER_AUTH_URL=https://pos-auth.example.com
BETTER_AUTH_SECRET=<generated-secret>
TRUSTED_ORIGINS=https://pos.example.com
```

Single-tenant mode skips the tenant registry and admin management APIs. Requests to `/admin/api/*`,
`/admin/tenants`, and `/admin/stats` are intentionally disabled, because they depend on multi-tenant
registry state.

### Shared Multi-Tenant Instance

```bash
AUTH_MODE=multi
NESTED_TENANCY_ENABLED=false
BETTER_AUTH_URL=https://auth.example.com
BETTER_AUTH_SECRET=<generated-secret>
TRUSTED_ORIGINS=https://app1.example.com,https://app2.example.com
```

### Hybrid with Nested Tenancy

```bash
AUTH_MODE=multi
NESTED_TENANCY_ENABLED=true
BETTER_AUTH_URL=https://auth.example.com
BETTER_AUTH_SECRET=<generated-secret>
TRUSTED_ORIGINS=https://tenant-a.example.com,https://tenant-b.example.com
```

Wildcard subdomains are supported when the scheme is provided. For example:

```bash
TRUSTED_ORIGINS=https://*.example.com
```

For full setup instructions—including database provisioning and admin seeding—refer to
[PROVISIONING.md](./PROVISIONING.md) and [INSTALLATION.md](./INSTALLATION.md).
