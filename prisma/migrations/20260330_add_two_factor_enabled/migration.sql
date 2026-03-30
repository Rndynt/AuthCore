-- Migration: add twoFactorEnabled to users across all schemas
-- This column is required by the Better Auth twoFactor() plugin.
-- New tenant schemas are auto-provisioned via LIKE "public"."users",
-- so adding it here is sufficient for all future tenants.

-- 1. Public schema (base template for tenant provisioning)
ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;

-- 2. Admin schema
ALTER TABLE authcore_system.users
  ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;

-- 3. All existing tenant schemas (idempotent DO block)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    ORDER BY schema_name
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.users ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false',
      r.schema_name
    );
  END LOOP;
END;
$$;
