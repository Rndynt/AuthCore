import type { Pool } from 'pg';
import type { TenantRepository } from '../../core/src/ports/tenant-repository';
import type { CreateTenantInput, Tenant, TenantStatus } from '../../core/src/domain/tenant/tenant';
import { TenantValidationError } from '../../core/src/errors/tenant-errors';
import { createPgPool } from './pg-pool';
import { tenantDomainToLegacy, tenantRowToDomain, type TenantRow } from './mappers/tenant.mapper';

/**
 * PgTenantRepository
 *
 * Responsible ONLY for tenant row persistence.
 * Schema provisioning is handled externally by TenantSchemaProvisioner,
 * injected into CreateTenantUseCase via the port.
 */
export class PgTenantRepository implements TenantRepository {
  constructor(private readonly pool: Pool = createPgPool()) {}

  async listTenants(): Promise<Tenant[]> {
    const result = await this.pool.query<TenantRow>(
      `SELECT * FROM public.tenants ORDER BY created_at DESC`,
    );
    return result.rows.map(tenantRowToDomain);
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    const result = await this.pool.query<TenantRow>(
      `SELECT * FROM public.tenants WHERE id = $1`,
      [tenantId],
    );
    return result.rows[0] ? tenantRowToDomain(result.rows[0]) : null;
  }

  /**
   * Insert a new tenant in 'provisioning' state.
   * Does NOT provision the schema — that is the use case's responsibility.
   */
  async createProvisioningTenant(input: CreateTenantInput & { schemaName: string }): Promise<Tenant> {
    await this.ensureStatusConstraint();

    const existing = await this.pool.query<{ id: string }>(
      `SELECT id FROM public.tenants WHERE id = $1 OR slug = $2 LIMIT 1`,
      [input.id, input.slug],
    );
    if ((existing.rowCount ?? 0) > 0) {
      throw new TenantValidationError('Tenant with the provided id or slug already exists.');
    }

    const result = await this.pool.query<TenantRow>(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, metadata)
       VALUES ($1, $2, $3, $4, 'provisioning', '{}'::jsonb)
       RETURNING *`,
      [input.id, input.name, input.slug, input.schemaName],
    );
    return tenantRowToDomain(result.rows[0]);
  }

  /**
   * Transition a tenant from 'provisioning' to 'active'.
   * Called by CreateTenantUseCase after schema provisioning succeeds.
   */
  async markTenantActive(tenantId: string): Promise<Tenant> {
    const result = await this.pool.query<TenantRow>(
      `UPDATE public.tenants
       SET status = 'active',
           metadata = COALESCE(metadata, '{}'::jsonb)
                      || jsonb_build_object('provisioned_at', NOW(), 'schema', schema_name),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [tenantId],
    );
    if (!result.rows[0]) {
      throw new TenantValidationError(`Tenant not found after provisioning: ${tenantId}`);
    }
    return tenantRowToDomain(result.rows[0]);
  }

  /**
   * Legacy combined path (for backward compatibility only).
   * In the new architecture, prefer createProvisioningTenant → markTenantActive.
   */
  async createTenant(input: CreateTenantInput & { schemaName: string }): Promise<Tenant> {
    return this.createProvisioningTenant(input);
  }

  async updateTenantStatus(tenantId: string, status: TenantStatus): Promise<Tenant | null> {
    const result = await this.pool.query<TenantRow>(
      `UPDATE public.tenants SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [tenantId, status],
    );
    return result.rows[0] ? tenantRowToDomain(result.rows[0]) : null;
  }

  async getTenantStatusSnapshot(): Promise<{ id: string; status: TenantStatus }[]> {
    const result = await this.pool.query<{ id: string; status: TenantStatus }>(
      `SELECT id, status FROM public.tenants`,
    );
    return result.rows;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async ensureStatusConstraint(): Promise<void> {
    const result = await this.pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS definition
         FROM pg_constraint c
         JOIN pg_class t ON c.conrelid = t.oid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'tenants'
          AND c.conname = 'tenants_status_check'
        LIMIT 1`,
    );
    const definition = result.rows[0]?.definition ?? '';
    const hasProvisioning = definition.includes("'provisioning'::text");
    const hasFailed = definition.includes("'failed'::text");
    if (!hasProvisioning || !hasFailed) {
      await this.pool.query(
        `ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_status_check`,
      );
      await this.pool.query(
        `ALTER TABLE public.tenants ADD CONSTRAINT tenants_status_check
         CHECK (status IN ('active', 'suspended', 'deleted', 'provisioning', 'failed'))`,
      );
    }
  }
}

export { tenantDomainToLegacy };
