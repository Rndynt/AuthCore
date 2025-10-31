# Installation Guide

This guide walks through getting AuthCore running from a clean checkout. By the end you will have a
local instance responding to both tenant and admin authentication requests.

## 1. Prerequisites

| Dependency | Version | Notes |
|------------|---------|-------|
| Node.js | 18.x or 20.x LTS | Required for Fastify server and tooling. |
| npm | 9+ | Used by default in project scripts. |
| PostgreSQL | 14+ | AuthCore relies on PostgreSQL schemas for isolation. |
| OpenSSL | — | Needed only to generate secure secrets. |

Ensure PostgreSQL is reachable from your development machine and that you have a database prepared
for AuthCore (the provisioning scripts create schemas and tables inside it).

## 2. Clone & Install

```bash
# Clone the repository
git clone <repository-url> authcore
cd authcore

# Install dependencies
npm install
```

The repository includes Prisma client artefacts and SQL templates, so no additional build steps are
necessary before the first run.

## 3. Configure Environment

AuthCore reads all configuration from a `.env` file in the project root. Start from the template
below and adapt the values to your environment. Refer to [CONFIGURATION.md](./CONFIGURATION.md) for a
complete explanation of each variable and the possible operating modes.

```bash
cp CLIENT_ENV_EXAMPLE.md .env # or create manually using the snippet below
```

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/authcore

# Platform URL & secrets
BETTER_AUTH_URL=http://localhost:5000
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
TRUSTED_ORIGINS=http://localhost:3000,http://localhost:5000

# Mode selection
AUTH_MODE=multi
NESTED_TENANCY_ENABLED=false
TENANT_ID=
TENANT_SCHEMA=

# Optional flags
ENABLE_DEV_ENDPOINTS=false
ADMIN_API_KEY=
```

After editing `.env`, run a quick sanity check to confirm the configuration parses correctly:

```bash
npm run check
```

If the command exits without errors the environment variables satisfy the runtime schema in
`src/env.ts`.

## 4. Provision Database Assets

With configuration in place you can create the required schemas, tables, and seed data. See
[PROVISIONING.md](./PROVISIONING.md) for the detailed commands. The short version is:

1. Run `scripts/setup-single.sh`, `scripts/setup-multi.sh`, or `scripts/setup-nested.sh` depending on
   your chosen `AUTH_MODE`.
2. Run `scripts/setup-admin.sh` to ensure the `authcore_system` schema exists.
3. Seed the root admin account via `npx tsx scripts/seed-admin.ts`.

These steps are idempotent and safe to rerun.

## 5. Start the Server

```bash
npm run dev
```

By default the Fastify server listens on `http://localhost:5000`. The logs will display the active
mode and feature flags at startup.

## 6. Verify Access

Follow the flow in [TESTING.md](./TESTING.md) to confirm:

- The admin user can authenticate against `/admin/auth/sign-in/email`.
- Tenants can sign up and sign in via `/api/auth/*`.
- Sessions can be retrieved with `/me` (multi-tenant) or `/api/auth/get-session` (single-tenant).

Once these checks succeed your environment is ready for dashboard and tenant development.
