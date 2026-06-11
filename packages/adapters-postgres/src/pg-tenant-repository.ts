import type { Pool } from 'pg';
import type { TenantRepository } from '../../core/src/ports/tenant-repository';
import type { CreateTenantInput, Tenant, TenantStatus } from '../../core/src/domain/tenant/tenant';
import { TenantValidationError } from '../../core/src/errors/tenant-errors';
import { createPgPool } from './pg-pool';
import { tenantDomainToLegacy, tenantRowToDomain, type TenantRow } from './mappers/tenant.mapper';
import { PgTenantSchemaProvisioner } from './pg-tenant-schema-provisioner';

export class PgTenantRepository implements TenantRepository {
  constructor(private readonly pool: Pool = createPgPool()) {}
  async listTenants(): Promise<Tenant[]> { const r = await this.pool.query<TenantRow>(`SELECT * FROM public.tenants ORDER BY created_at DESC`); return r.rows.map(tenantRowToDomain); }
  async getTenant(tenantId: string): Promise<Tenant | null> { const r = await this.pool.query<TenantRow>(`SELECT * FROM public.tenants WHERE id = $1`, [tenantId]); return r.rows[0] ? tenantRowToDomain(r.rows[0]) : null; }
  async createTenant(input: CreateTenantInput & { schemaName: string }): Promise<Tenant> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const provisioner = new PgTenantSchemaProvisioner(client);
      await provisioner.ensureTenantStatusConstraint();
      const existing = await client.query<{ id: string }>(`SELECT id FROM public.tenants WHERE id = $1 OR slug = $2 LIMIT 1`, [input.id, input.slug]);
      if ((existing.rowCount ?? 0) > 0) throw new TenantValidationError('Tenant with the provided id or slug already exists.');
      const inserted = await client.query<TenantRow>(`INSERT INTO public.tenants (id, name, slug, schema_name, status, metadata) VALUES ($1, $2, $3, $4, 'provisioning', '{}'::jsonb) RETURNING *`, [input.id, input.name, input.slug, input.schemaName]);
      await provisioner.provisionTenantSchema(tenantRowToDomain(inserted.rows[0]));
      const activated = await client.query<TenantRow>(`UPDATE public.tenants SET status = 'active', metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('provisioned_at', NOW(), 'schema', schema_name), updated_at = NOW() WHERE id = $1 RETURNING *`, [input.id]);
      await client.query('COMMIT');
      return tenantRowToDomain(activated.rows[0]);
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { client.release(); }
  }
  async updateTenantStatus(tenantId: string, status: TenantStatus): Promise<Tenant | null> { const r = await this.pool.query<TenantRow>(`UPDATE public.tenants SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [tenantId, status]); return r.rows[0] ? tenantRowToDomain(r.rows[0]) : null; }
  async getTenantStatusSnapshot() { const r = await this.pool.query<{ id: string; status: TenantStatus }>(`SELECT id, status FROM public.tenants`); return r.rows; }
}

export { tenantDomainToLegacy };
