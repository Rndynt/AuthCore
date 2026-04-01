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
├── admin-ui/           # Next.js 15 Admin Dashboard (dev server on port 5000)
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
- **Startup script**: `bash start.sh` (starts both backend and admin UI)
- **Backend**: `npm run dev` (runs `tsx src/server.ts`, port 5001)
- **Admin UI**: `cd admin-ui && npm run dev -- -p 5000` (port 5000 webview)
- **Build backend**: `npm run build` (note: tsconfig has `noEmit: true`, use `tsx` for runtime)
- **Prisma generate**: `npm run prisma:gen`
- **Prisma migrate**: `npm run prisma:deploy`
- **Health check**: `GET /healthz` on port 5001

## Docker / Production
- **Dockerfile** (root): Backend API, runs via `tsx src/server.ts` on port 4000
- **admin-ui/Dockerfile**: Next.js standalone build, runs on port 3000
- **docker-compose.yml**: Orchestrates both services, internal network `realmio_net`
- **Admin UI env var**: `NEXT_INTERNAL_API_URL=http://api:4000` (Docker internal network)
- See `docs/DEPLOY_VPS_DOCKER.md` for full VPS deployment guide with Nginx

## Architecture on Replit
- **Port 5000**: Admin UI (Next.js dev server) — shown as main webview
- **Port 5001**: Backend API (Fastify server) — proxied via Next.js rewrites
- **Admin UI rewrites**: `/api/*`, `/admin/*`, `/tenant/*`, `/dev/*`, `/me`, `/healthz` → `localhost:5001`
- **Workflow**: "Start application" runs `bash start.sh`, waits on port 5000

## Environment Variables
| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes (secret) |
| `BETTER_AUTH_SECRET` | Session signing secret (min 24 chars) | Yes (secret) |
| `BETTER_AUTH_URL` | Public URL of the auth service | shared env var |
| `AUTH_MODE` | `single` or `multi` | shared env var |
| `NODE_ENV` | `development` or `production` | shared env var |
| `PORT` | Backend API port (default 5001) | shared env var |
| `ENABLE_DEV_ENDPOINTS` | `true`/`false` | shared env var |
| `NESTED_TENANCY_ENABLED` | `true`/`false` | shared env var |
| `TRUSTED_ORIGINS` | Comma-separated allowed CORS origins | shared env var |

## Database Setup
- Uses Neon PostgreSQL serverless (DATABASE_URL secret)
- Schema: `public` (tenants registry) + `authcore_system` (admin system) + per-tenant schemas
- Migrations: Prisma (`prisma/migrations/`) — run `npm run prisma:deploy`
- The multi-tenant migration creates `public.tenants`, `public.applications`, `authcore_system.*` tables

## Key Features
- **Multi-tenancy**: Schema isolation per tenant, LRU connection eviction
- **Auth modes**: `single` (dedicated) or `multi` (shared)
- **Security**: Rate limiting, IP blocking, HSTS, CSP-ready headers, 2FA (TOTP)
- **Admin Dashboard**: Accessible at root `/` via the Next.js frontend
- **API routes**: `/api/auth/*`, `/tenant/:id/api/auth/*`, `/admin/*`, `/dev/*`
