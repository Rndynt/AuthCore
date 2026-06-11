import type { PoolClient } from 'pg';
import type { Tenant } from '../../core/src/domain/tenant/tenant';

export class PgTenantSchemaProvisioner {
  constructor(private readonly client: Pick<PoolClient, 'query'>) {}

  async ensureTenantStatusConstraint(): Promise<void> {
    const result = await this.client.query<{ definition: string }>(`SELECT pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = 'public' AND t.relname = 'tenants' AND c.conname = 'tenants_status_check' LIMIT 1`);
    const definition = result.rows[0]?.definition ?? '';
    if (!definition.includes("'provisioning'::text") || !definition.includes("'failed'::text")) {
      await this.client.query(`ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_status_check`);
      await this.client.query(`ALTER TABLE public.tenants ADD CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended', 'deleted', 'provisioning', 'failed'))`);
    }
  }

  async provisionTenantSchema(tenant: Tenant): Promise<void> {
    const schemaName = tenant.schemaName;
    const betterAuthTables = ['user','session','account','verification','organization','member','invitation','apikey','jwks','two_factor','users','accounts','sessions','verificationtokens','api_keys','organizations','organization_members'];
    await this.client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    const existingTablesResult = await this.client.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])`, [betterAuthTables]);
    const existingTables = new Set(existingTablesResult.rows.map(r => r.tablename));
    for (const table of betterAuthTables) {
      if (!existingTables.has(table)) continue;
      await this.client.query(`CREATE TABLE IF NOT EXISTS "${schemaName}"."${table}" (LIKE "public"."${table}" INCLUDING ALL)`);
    }
  }
}
