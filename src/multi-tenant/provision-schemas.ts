import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function provisionTenantSchemas() {
  try {
    console.log('🚀 Starting tenant schema provisioning...\n');

    const tenants = await pool.query(`
      SELECT id, name, schema_name 
      FROM public.tenants 
      WHERE status = 'active'
      ORDER BY id
    `);

    const betterAuthTables = [
      'users', 'accounts', 'sessions', 'verificationtokens', 
      'api_keys', 'organizations', 'organization_members', 
      'verification', 'member', 'invitation', 'apikey', 'jwks'
    ];

    for (const tenant of tenants.rows) {
      console.log(`📁 Provisioning schema for: ${tenant.name} (${tenant.schema_name})`);
      
      await pool.query(`CREATE SCHEMA IF NOT EXISTS "${tenant.schema_name}"`);
      console.log(`   ✅ Schema created: ${tenant.schema_name}`);

      for (const table of betterAuthTables) {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS "${tenant.schema_name}"."${table}" 
          (LIKE "public"."${table}" INCLUDING ALL)
        `);
        console.log(`   ✅ Table cloned: ${tenant.schema_name}.${table}`);
      }

      console.log(`   ✅ Tenant schema provisioned successfully\n`);
    }

    console.log('✅ All tenant schemas provisioned successfully!');
    
  } catch (error) {
    console.error('❌ Provisioning failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

provisionTenantSchemas()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
