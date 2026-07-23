# Realmio

Headless multi-tenant authentication service built with Fastify + Better Auth + PostgreSQL.

## How to run

The **Start application** workflow handles everything:
1. Builds the Next.js admin UI into static files (`dist/public/`)
2. Starts the Fastify API on **port 5000**, which also serves the admin UI

Run command: `bash start.sh`

## URLs

| Surface | Path |
|---------|------|
| Admin UI | `/admin/login` |
| Health check | `/healthz` |
| Admin sign-up | `POST /admin/auth/sign-up/email` |
| Admin sign-in | `POST /admin/auth/sign-in/email` |
| Tenant auth | `POST /api/auth/sign-up/email` (requires `X-Tenant-Id` header) |

## First-time admin setup

After starting the server, create the first admin user and elevate their role:

```bash
# 1. Sign up
curl -X POST http://localhost:5000/admin/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@realmio.id","password":"Admin123!","name":"Admin"}'

# 2. Elevate to admin role (use DATABASE_URL from Replit secrets)
psql "$DATABASE_URL" -c "UPDATE authcore_system.users SET role = 'admin' WHERE email = 'admin@realmio.id';"
```

Then open `/admin/login` and sign in.

## Tech stack

- **API**: Fastify 5, TypeScript, Node.js 20
- **Auth**: Better Auth 1.x
- **ORM**: Prisma 6
- **Database**: PostgreSQL (Replit built-in)
- **Admin UI**: Next.js 15 + Tailwind CSS (static export)

## Environment variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 5000) |
| `BETTER_AUTH_SECRET` | Auth signing secret (min 24 chars) |
| `BETTER_AUTH_URL` | Public base URL of this server |
| `TRUSTED_ORIGINS` | Comma-separated allowed CORS origins |
| `AUTH_MODE` | `multi` (default) or `single` |
| `DATABASE_URL` | PostgreSQL connection string (Replit-managed) |
| `ENABLE_DEV_ENDPOINTS` | `true` to enable `/dev/*` debug routes |

## Project structure

```
apps/api/          — Fastify API entry point and config
packages/
  config/          — Environment parsing, auth mode config
  server-fastify/  — Fastify app factory, routes, plugins
  adapters-*/      — Database adapters (Prisma, Postgres)
admin-ui/          — Next.js admin dashboard (static export)
prisma/            — Prisma schema and migrations
```

## User preferences

- Use `--legacy-peer-deps` for all npm installs
