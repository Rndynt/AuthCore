import pkg from 'pg';
const { Pool } = pkg;
import type { PoolClient } from 'pg';
import type { AuditLogEntry } from '../../domain/tenant/audit-log.js';
import { TenantValidationError } from '../../domain/tenant/errors.js';
import type { SecuritySettings } from '../../domain/tenant/security-settings.js';
import type { CreateTenantInput, Tenant, TenantStatus } from '../../domain/tenant/tenant.js';
import type { TenantRepository } from '../../domain/tenant/tenant-repository.js';

export class PgTenantRepository implements TenantRepository {
  private pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  private adminSettingsInitialized = false;
  private tenantStatusConstraintValidated = false;

  async listTenants(): Promise<Tenant[]> {
    const result = await this.pool.query<Tenant>(`
      SELECT * FROM public.tenants
      ORDER BY created_at DESC
    `);
    return result.rows;
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    const result = await this.pool.query<Tenant>(`
      SELECT * FROM public.tenants
      WHERE id = $1
    `, [tenantId]);

    return result.rows[0] ?? null;
  }

  async createTenant(input: CreateTenantInput & { schemaName: string }): Promise<Tenant> {
    const client = await this.pool.connect();
    const { id, name, slug, schemaName } = input;

    try {
      await client.query('BEGIN');

      await this.ensureTenantStatusConstraint(client);

      const existing = await client.query<{ id: string }>(
        `SELECT id FROM public.tenants WHERE id = $1 OR slug = $2 LIMIT 1`,
        [id, slug]
      );

      if ((existing.rowCount ?? 0) > 0) {
        throw new TenantValidationError('Tenant with the provided id or slug already exists.');
      }

      const inserted = await client.query<Tenant>(`
        INSERT INTO public.tenants (id, name, slug, schema_name, status, metadata)
        VALUES ($1, $2, $3, $4, 'provisioning', '{}'::jsonb)
        RETURNING *
      `, [id, name, slug, schemaName]);

      const tenantRow = inserted.rows[0];

      console.log(`[TenantRepository] Created tenant registry entry: ${tenantRow.id}`);

      await this.provisionTenantSchema(client, tenantRow);

      const activated = await client.query<Tenant>(`
        UPDATE public.tenants
        SET
          status = 'active',
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'provisioned_at', NOW(),
            'schema', schema_name
          ),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id]);

      await client.query('COMMIT');

      return activated.rows[0];
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error(`[TenantRepository] ❌ Provisioning failed for ${id}:`, error);

      if (error instanceof TenantValidationError) {
        throw error;
      }

      throw new Error('Tenant provisioning failed. Check logs for details and retry.');
    } finally {
      client.release();
    }
  }

  async updateTenantStatus(tenantId: string, status: TenantStatus): Promise<Tenant | null> {
    const result = await this.pool.query<Tenant>(`
      UPDATE public.tenants
      SET status = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [tenantId, status]);

    return result.rows[0] ?? null;
  }

  async getTenantStatusSnapshot(): Promise<Array<{ id: string; status: TenantStatus }>> {
    const result = await this.pool.query<{ id: string; status: TenantStatus }>(`
      SELECT id, status FROM public.tenants
    `);

    return result.rows;
  }

  async ensureAdminSettingsTable(): Promise<void> {
    if (this.adminSettingsInitialized) {
      return;
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS authcore_system.admin_settings (
        id INTEGER PRIMARY KEY,
        settings JSONB NOT NULL,
        updated_by TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    this.adminSettingsInitialized = true;
  }

  async getSecuritySettings(): Promise<SecuritySettings | null> {
    const result = await this.pool.query<{ settings: SecuritySettings }>(`
      SELECT settings FROM authcore_system.admin_settings WHERE id = 1
    `);

    if ((result.rowCount ?? 0) === 0) {
      return null;
    }

    return result.rows[0]?.settings ?? null;
  }

  async updateSecuritySettings(adminUserId: string, settings: SecuritySettings): Promise<void> {
    await this.pool.query(`
      INSERT INTO authcore_system.admin_settings (id, settings, updated_by, updated_at)
      VALUES (1, $1::jsonb, $2, NOW())
      ON CONFLICT (id) DO UPDATE SET
        settings = EXCLUDED.settings,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at
    `, [JSON.stringify(settings), adminUserId]);
  }

  async logAuditAction(
    adminUserId: string,
    action: string,
    targetType: string,
    targetId: string,
    details: Record<string, any> = {},
    ipAddress?: string
  ): Promise<void> {
    await this.pool.query(`
      INSERT INTO authcore_system.audit_actions (
        admin_user_id, action, target_type, target_id, details, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [adminUserId, action, targetType, targetId, JSON.stringify(details), ipAddress || null]);
  }

  async getAuditLogs(
    limit: number,
    offset: number,
    filters?: {
      action?: string;
      targetType?: string;
      targetId?: string;
      adminUserId?: string;
      from?: string;
      to?: string;
      search?: string;
      tenantStatus?: string;
    }
  ): Promise<{ logs: AuditLogEntry[]; total: number }> {
    try {
      const tenantIdExpr = `(
        CASE
          WHEN a.target_type = 'tenant' THEN a.target_id
          WHEN a.target_type = 'user' THEN split_part(a.target_id, ':', 1)
          WHEN a.details ? 'tenantId' THEN a.details->>'tenantId'
          ELSE NULL
        END
      )`;

      const conditions: string[] = [];
      const values: any[] = [];

      if (filters?.action) {
        values.push(filters.action);
        conditions.push(`a.action = $${values.length}`);
      }

      if (filters?.targetType) {
        values.push(filters.targetType);
        conditions.push(`a.target_type = $${values.length}`);
      }

      if (filters?.targetId) {
        values.push(filters.targetId);
        conditions.push(`a.target_id = $${values.length}`);
      }

      if (filters?.adminUserId) {
        values.push(filters.adminUserId);
        conditions.push(`a.admin_user_id = $${values.length}`);
      }

      if (filters?.from) {
        const fromDate = new Date(filters.from);
        if (!Number.isNaN(fromDate.getTime())) {
          values.push(fromDate);
          conditions.push(`a.created_at >= $${values.length}`);
        }
      }

      if (filters?.to) {
        const toDate = new Date(filters.to);
        if (!Number.isNaN(toDate.getTime())) {
          values.push(toDate);
          conditions.push(`a.created_at <= $${values.length}`);
        }
      }

      if (filters?.search) {
        const normalized = `%${filters.search.trim().toLowerCase()}%`;
        values.push(normalized);
        const placeholder = `$${values.length}`;
        conditions.push(`(LOWER(a.action) LIKE ${placeholder} OR LOWER(a.target_id) LIKE ${placeholder} OR LOWER(CAST(a.details AS TEXT)) LIKE ${placeholder})`);
      }

      if (filters?.tenantStatus) {
        values.push(filters.tenantStatus);
        conditions.push(`EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = ${tenantIdExpr} AND t.status = $${values.length})`);
      }

      const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      const countResult = await this.pool.query<{ total: string }>(`
        SELECT COUNT(*) as total
        FROM authcore_system.audit_actions a
        ${whereClause}
      `, values);

      const dataValues = [...values, limit, offset];
      const logsResult = await this.pool.query<AuditLogEntry>(`
        SELECT
          a.id,
          a.admin_user_id,
          a.action,
          a.target_type,
          a.target_id,
          a.details,
          a.ip_address,
          a.created_at,
          ${tenantIdExpr} AS tenant_id,
          tenants.name AS tenant_name,
          tenants.status AS tenant_status
        FROM authcore_system.audit_actions a
        LEFT JOIN public.tenants tenants ON tenants.id = ${tenantIdExpr}
        ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `, dataValues);

      const logs = logsResult.rows.map(log => {
        let details: Record<string, any> = {};

        if (typeof log.details === 'object' && log.details !== null) {
          details = log.details as Record<string, any>;
        } else if (log.details) {
          try {
            details = JSON.parse(String(log.details));
          } catch (parseError) {
            console.warn('[TenantRepository] Failed to parse audit log details', parseError);
            details = { raw: String(log.details) };
          }
        }

        return {
          ...log,
          details
        };
      });

      return {
        logs,
        total: parseInt(countResult.rows[0]?.total ?? '0', 10)
      };
    } catch (error: any) {
      if (error?.code === '42P01') {
        console.warn('[TenantRepository] Audit log table not found. Returning empty result.');
        return { logs: [], total: 0 };
      }

      throw error;
    }
  }

  private async ensureTenantStatusConstraint(client: PoolClient): Promise<void> {
    if (this.tenantStatusConstraintValidated) {
      return;
    }

    const result = await client.query<{ definition: string }>(`
      SELECT pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'tenants'
        AND c.conname = 'tenants_status_check'
      LIMIT 1
    `);

    const definition = result.rows[0]?.definition ?? '';
    const hasProvisioning = definition.includes("'provisioning'::text");
    const hasFailed = definition.includes("'failed'::text");

    if (!hasProvisioning || !hasFailed) {
      await client.query(`
        ALTER TABLE public.tenants
          DROP CONSTRAINT IF EXISTS tenants_status_check
      `);

      await client.query(`
        ALTER TABLE public.tenants
          ADD CONSTRAINT tenants_status_check
          CHECK (status IN ('active', 'suspended', 'deleted', 'provisioning', 'failed'))
      `);
    }

    this.tenantStatusConstraintValidated = true;
  }

  private async provisionTenantSchema(client: PoolClient, tenant: Tenant): Promise<void> {
    console.log(`[TenantRepository] Provisioning schema: ${tenant.schema_name}`);

    const betterAuthTables = [
      'users', 'accounts', 'sessions', 'verificationtokens',
      'api_keys', 'organizations', 'organization_members',
      'verification', 'member', 'invitation', 'apikey', 'jwks'
    ];

    await client.query(`CREATE SCHEMA IF NOT EXISTS "${tenant.schema_name}"`);
    console.log(`[TenantRepository] Schema created: ${tenant.schema_name}`);

    for (const table of betterAuthTables) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${tenant.schema_name}"."${table}"
        (LIKE "public"."${table}" INCLUDING ALL)
      `);
    }

    console.log(`[TenantRepository] Tables cloned for: ${tenant.schema_name}`);
  }
}
