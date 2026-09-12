import pkg from 'pg';
import { pathToFileURL } from 'node:url';
const { Pool } = pkg;

const BETTER_AUTH_TABLES = [
  'users', 'accounts', 'sessions', 'verificationtokens',
  'api_keys', 'organizations', 'organization_members',
  'verification', 'member', 'invitation', 'apikey', 'jwks'
];

/**
 * Idempotent: safe to call on every boot. `CREATE SCHEMA IF NOT EXISTS` and
 * `CREATE TABLE IF NOT EXISTS ... (LIKE ...)` are no-ops once a tenant schema
 * already has its Better Auth tables cloned.
 *
 * Accepts an existing pool/client so callers (e.g. the startup bootstrap) can
 * reuse a connection instead of opening a new one per invocation.
 */
export async function provisionTenantSchemas(pool: InstanceType<typeof Pool>): Promise<void> {
  console.log('🚀 Starting tenant schema provisioning...\n');

  const tenants = await pool.query(`
    SELECT id, name, schema_name 
    FROM public.tenants 
    WHERE status = 'active'
    ORDER BY id
  `);

  for (const tenant of tenants.rows) {
    console.log(`📁 Provisioning schema for: ${tenant.name} (${tenant.schema_name})`);

    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${tenant.schema_name}"`);
    console.log(`   ✅ Schema created: ${tenant.schema_name}`);

    for (const table of BETTER_AUTH_TABLES) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${tenant.schema_name}"."${table}" 
        (LIKE "public"."${table}" INCLUDING ALL)
      `);
      console.log(`   ✅ Table cloned: ${tenant.schema_name}.${table}`);
    }

    console.log(`   ✅ Tenant schema provisioned successfully\n`);
  }

  console.log(`✅ All tenant schemas provisioned successfully! (${tenants.rows.length} tenant(s))`);
}

// ---------------------------------------------------------------------------
// CLI entrypoint — only runs when this file is executed directly
// (e.g. `npx tsx src/multi-tenant/provision-schemas.ts`), not when imported
// as a module (e.g. from apps/api/src/bootstrap-db.ts).
// ---------------------------------------------------------------------------
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  provisionTenantSchemas(pool)
    .catch((error) => {
      console.error('❌ Provisioning failed:', error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
