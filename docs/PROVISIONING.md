# Provisioning Guide

This guide describes how to create and maintain the PostgreSQL assets that Realmio expects. The
process is split into three layers:

1. **Core mode setup** – Creates tenant tables and schemas for your selected operating mode.
2. **Admin system** – Provisions the `authcore_system` schema used by the dashboard.
3. **Bootstrap data** – Seeds the root admin and optional sample tenants.

All scripts are idempotent; rerunning them is safe and keeps your database aligned with the latest
SQL templates in the repository.

## 1. Mode Setup Scripts

Run exactly one of the following scripts after exporting `DATABASE_URL` in your shell. Each script
creates the baseline tables for the chosen tenancy model.

### Single-Tenant (`AUTH_MODE=single`)

```bash
export DATABASE_URL=postgresql://user:password@host:5432/authcore
bash scripts/setup-single.sh
```

This script prepares a fixed tenant schema and ensures the `public.tenants` registry reflects the
single tenant defined by `TENANT_ID` and `TENANT_SCHEMA`.

### Multi-Tenant (`AUTH_MODE=multi`, `NESTED_TENANCY_ENABLED=false`)

```bash
export DATABASE_URL=postgresql://user:password@host:5432/authcore
bash scripts/setup-multi.sh
```

The script provisions the public registry tables and a starter tenant schema for smoke testing. You
can add more tenants later using the admin APIs or SQL templates in `src/multi-tenant`.

### Hybrid (`AUTH_MODE=multi`, `NESTED_TENANCY_ENABLED=true`)

```bash
export DATABASE_URL=postgresql://user:password@host:5432/authcore
bash scripts/setup-nested.sh
```

In addition to the multi-tenant baseline this script deploys nested-sub-tenant structures from
`src/multi-tenant/nested-schema.sql`.

## 2. Admin System

After the core mode setup, create the admin schema:

```bash
export DATABASE_URL=postgresql://user:password@host:5432/authcore
bash scripts/setup-admin.sh
```

The script runs `scripts/setup-admin-schema.sql`, which contains the Better Auth admin tables
(`users`, `accounts`, `sessions`, etc.) under the `authcore_system` schema.

## 3. Seed Root Administrator

Realmio ships with a TypeScript seeder that creates or repairs the root admin credentials. Execute
it anytime you need to guarantee access for the dashboard team.

```bash
export DATABASE_URL=postgresql://user:password@host:5432/authcore
npx tsx scripts/seed-admin.ts
```

The script outputs the credentials (`root@realmio.local` / `Realmio123!`) and upgrades existing
bcrypt hashes to Better Auth's scrypt format when required. Change the password immediately after the
first login.

## 4. Creating Tenants

There are two common approaches for provisioning tenants after the baseline scripts run:

1. **Admin Dashboard / API** – Authenticate as the root admin and call the `/admin/api/*` routes to
   create tenants, applications, and audit log entries. These APIs persist data into `public.tenants`
   and trigger schema provisioning through `tenantManager`.
2. **Manual SQL** – Use the helper statements in `src/multi-tenant/provision-schemas.ts` to create a
   schema and insert metadata. This is useful for offline migrations or bulk imports.

Regardless of the approach, the connection manager automatically builds Prisma connection strings for
new tenants on the next request.

## 5. Verifying the Database

Use the following commands to confirm the setup:

```bash
# List schemas (should include authcore_system and tenant_*)
psql $DATABASE_URL -c "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name;"

# Check admin tables exist
psql $DATABASE_URL -c "\dt authcore_system.*"

# Confirm tenant registry entries
psql $DATABASE_URL -c "SELECT id, slug, schema_name FROM public.tenants ORDER BY created_at DESC;"
```

If any of the checks fail, rerun the corresponding setup script or review the SQL templates referenced
in the error message. Once all checks pass you can proceed to the login tests in
[TESTING.md](./TESTING.md).
