# Realmio — Multi-Tenant Authentication Service

## Overview
Realmio is a headless, multi-tenant authentication service built on **Fastify** and **Better Auth**. It provides a robust backend for managing multiple tenants (applications) with isolated PostgreSQL schemas, alongside a **Next.js admin dashboard** (Realmio Console) for centralized management.

## Tech Stack
- **Backend**: Fastify 5, Better Auth 1.x, Node.js 20+
- **ORM**: Prisma 6 (primary), Drizzle ORM (secondary/migrations)
- **Database**: PostgreSQL (Neon) — schema-based multi-tenancy
- **Admin UI**: Next.js 15, Tailwind CSS, Radix UI, TanStack Query
- **Language**: TypeScript
- **Validation**: Zod

## Project Structure
```
├── admin-ui/           # Next.js 15 Admin Dashboard (static export → admin-ui/out/)
├── docs/               # Documentation
├── prisma/             # Prisma schema + migrations
├── scripts/            # Setup and seeding scripts
└── src/                # Backend source
    ├── admin/          # Admin API routes & middleware
    ├── application/    # Service layer (TenantService)
    ├── config/         # Auth mode & feature flag config
    ├── domain/         # Business logic (Tenant, AuditLog)
    ├── infrastructure/ # DB repositories
    ├── multi-tenant/   # Connection manager, middleware, schema logic
    ├── utils/          # Rate limiting, errors, logging
    ├── auth.ts         # Better Auth instance
    └── server.ts       # Fastify server entry point
```

## Running the Project
- **Dev server**: `npm run dev` (runs `tsx src/server.ts`, port 5000)
- **Build backend**: `npm run build`
- **Build admin UI**: `cd admin-ui && NODE_ENV=production npm run build` (outputs to `admin-ui/out/`)
- **Health check**: `GET /healthz`

## Environment Variables
| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes (secret) |
| `BETTER_AUTH_SECRET` | Session signing secret (min 24 chars) | Yes (secret) |
| `AUTH_MODE` | `single` or `multi` | shared env var |
| `NODE_ENV` | `development` or `production` | shared env var |
| `ENABLE_DEV_ENDPOINTS` | `true`/`false` | shared env var |
| `NESTED_TENANCY_ENABLED` | `true`/`false` | shared env var |

## Database Setup
- Uses Neon PostgreSQL serverless
- Schema: `public` (tenants registry) + `authcore_system` (admin system) + per-tenant schemas
- Migrations: Prisma (`prisma/migrations/`) — run `npm run prisma:deploy`
- The multi-tenant migration (`20260223_multi_tenant_system`) creates `public.tenants`, `public.applications`, `authcore_system.*` tables

## Key Features
- **Multi-tenancy**: Schema isolation per tenant, LRU connection eviction
- **Auth modes**: `single` (dedicated) or `multi` (shared)
- **Security**: Rate limiting, IP blocking, HSTS, CSP-ready headers, 2FA (TOTP)
- **Admin Dashboard**: Served as static files from `admin-ui/out/` at root `/`
- **API routes**: `/api/auth/*`, `/tenant/:id/api/auth/*`, `/admin/*`, `/dev/*`

## Replit Configuration
- **Workflow**: "Auth Service" runs `npm run dev`, waits on port 5000
- **Ports**: 5000 (main), 4000 (unused)
- **Database**: Neon PostgreSQL (DATABASE_URL secret)
