/**
 * Tenant Management Service
 * Handles CRUD operations on public.tenants
 * Orchestrates tenant provisioning and lifecycle
 */

import pkg from 'pg';
const { Pool } = pkg;
import { tenantManager } from '../multi-tenant/connection-manager.js';

const TENANT_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;

export class TenantValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantValidationError';
  }
}

// Connection to public schema
const publicPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  schema_name: string;
  status: 'active' | 'suspended' | 'deleted';
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTenantInput {
  id: string;
  name: string;
  slug: string;
}

export interface TenantMetrics {
  userCount: number;
  sessionCount: number;
  organizationCount: number;
}

export interface AuditLogEntry {
  id: number;
  admin_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, any>;
  ip_address: string | null;
  created_at: Date;
}

function normalizeTenantIdentifier(value: string, field: 'id' | 'slug'): string {
  const normalized = value.trim().toLowerCase();

  if (!TENANT_IDENTIFIER_PATTERN.test(normalized)) {
    throw new TenantValidationError(
      `Invalid tenant ${field}. Use lowercase letters, numbers, dashes, or underscores (1-63 characters).`
    );
  }

  return normalized;
}

export class TenantService {
  /**
   * List all tenants
   */
  async listTenants(): Promise<Tenant[]> {
    const result = await publicPool.query<Tenant>(`
      SELECT * FROM public.tenants 
      ORDER BY created_at DESC
    `);
    return result.rows;
  }

  /**
   * Get single tenant by ID
   */
  async getTenant(tenantId: string): Promise<Tenant | null> {
    const result = await publicPool.query<Tenant>(`
      SELECT * FROM public.tenants 
      WHERE id = $1
    `, [tenantId]);
    
    return result.rows[0] || null;
  }

  /**
   * Create new tenant and provision schema
   */
  async createTenant(input: CreateTenantInput): Promise<Tenant> {
    const tenantId = normalizeTenantIdentifier(input.id, 'id');
    const tenantSlug = normalizeTenantIdentifier(input.slug, 'slug');
    const schemaSuffix = tenantId.replace(/-/g, '_');
    const schemaName = `tenant_${schemaSuffix}`;

    // Ensure identifiers are available
    const existing = await publicPool.query<{ id: string }>(
      `SELECT id FROM public.tenants WHERE id = $1 OR slug = $2 LIMIT 1`,
      [tenantId, tenantSlug]
    );

    if ((existing.rowCount ?? 0) > 0) {
      throw new TenantValidationError('Tenant with the provided id or slug already exists.');
    }

    // 1. Insert to public.tenants
    const result = await publicPool.query<Tenant>(`
      INSERT INTO public.tenants (id, name, slug, schema_name, status, metadata)
      VALUES ($1, $2, $3, $4, 'active', '{}')
      RETURNING *
    `, [tenantId, input.name, tenantSlug, schemaName]);

    const tenant = result.rows[0];

    console.log(`[TenantService] Created tenant registry: ${tenant.id}`);

    // 2. Provision schema synchronously to ensure readiness
    await this.provisionTenantSchema(tenant);

    const tenantRecord: Tenant = {
      ...tenant,
      slug: tenantSlug,
      id: tenantId,
      schema_name: schemaName,
      metadata: tenant.metadata || {}
    };

    await tenantManager.registerTenant(tenantRecord);

    return tenantRecord;
  }

  /**
   * Provision tenant schema (clone Better Auth tables)
   */
  private async provisionTenantSchema(tenant: Tenant): Promise<void> {
    console.log(`[TenantService] Provisioning schema: ${tenant.schema_name}`);
    
    const betterAuthTables = [
      'users', 'accounts', 'sessions', 'verificationtokens', 
      'api_keys', 'organizations', 'organization_members', 
      'verification', 'member', 'invitation', 'apikey', 'jwks'
    ];

    try {
      // Create schema
      await publicPool.query(`CREATE SCHEMA IF NOT EXISTS "${tenant.schema_name}"`);
      console.log(`[TenantService] Schema created: ${tenant.schema_name}`);

      // Clone tables
      for (const table of betterAuthTables) {
        await publicPool.query(`
          CREATE TABLE IF NOT EXISTS "${tenant.schema_name}"."${table}" 
          (LIKE "public"."${table}" INCLUDING ALL)
        `);
      }
      
      console.log(`[TenantService] Tables cloned for: ${tenant.schema_name}`);

      console.log(`[TenantService] ✅ Tenant ${tenant.id} provisioned successfully`);
      
    } catch (error) {
      console.error(`[TenantService] ❌ Provisioning failed:`, error);
      
      // Update status to failed
      await publicPool.query(`
        UPDATE public.tenants 
        SET metadata = jsonb_set(metadata, '{provisioning_error}', $1::jsonb)
        WHERE id = $2
      `, [JSON.stringify(String(error)), tenant.id]);
      
      throw error;
    }
  }

  /**
   * Suspend tenant
   */
  async suspendTenant(tenantId: string): Promise<void> {
    const result = await publicPool.query<Tenant>(`
      UPDATE public.tenants
      SET status = 'suspended', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [tenantId]);

    const tenant = result.rows[0];
    if (!tenant) {
      throw new TenantValidationError(`Tenant not found: ${tenantId}`);
    }

    await tenantManager.registerTenant({
      ...tenant,
      metadata: tenant.metadata || {}
    });

    console.log(`[TenantService] Tenant ${tenantId} suspended`);
  }

  /**
   * Activate tenant
   */
  async activateTenant(tenantId: string): Promise<void> {
    const result = await publicPool.query<Tenant>(`
      UPDATE public.tenants
      SET status = 'active', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [tenantId]);

    const tenant = result.rows[0];
    if (!tenant) {
      throw new TenantValidationError(`Tenant not found: ${tenantId}`);
    }

    await tenantManager.registerTenant({
      ...tenant,
      metadata: tenant.metadata || {}
    });

    console.log(`[TenantService] Tenant ${tenantId} activated`);
  }

  /**
   * Delete tenant (soft delete)
   */
  async deleteTenant(tenantId: string): Promise<void> {
    const result = await publicPool.query<Tenant>(`
      UPDATE public.tenants
      SET status = 'deleted', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [tenantId]);

    const tenant = result.rows[0];
    if (!tenant) {
      throw new TenantValidationError(`Tenant not found: ${tenantId}`);
    }

    await tenantManager.registerTenant({
      ...tenant,
      metadata: tenant.metadata || {}
    });

    console.log(`[TenantService] Tenant ${tenantId} deleted (soft)`);
  }

  /**
   * Get tenant metrics
   */
  async getTenantMetrics(tenantId: string): Promise<TenantMetrics> {
    try {
      const client = tenantManager.getClient(tenantId);
      
      const [userCount, sessionCount, orgCount] = await Promise.all([
        client.user.count(),
        client.session.count({
          where: { expiresAt: { gt: new Date() } }
        }),
        client.organization.count()
      ]);
      
      return {
        userCount,
        sessionCount,
        organizationCount: orgCount
      };
    } catch (error) {
      console.error(`[TenantService] Metrics error for ${tenantId}:`, error);
      return {
        userCount: 0,
        sessionCount: 0,
        organizationCount: 0
      };
    }
  }

  /**
   * Get system-wide metrics
   */
  async getSystemMetrics() {
    const result = await publicPool.query<{ id: string; status: string }>(`
      SELECT id, status FROM public.tenants
    `);

    const tenants = result.rows;
    const totalTenants = tenants.length;
    const activeTenants = tenants.filter(t => t.status === 'active');
    const suspendedTenants = tenants.filter(t => t.status === 'suspended');

    const aggregate = await Promise.all(
      activeTenants.map(async tenant => this.getTenantMetrics(tenant.id))
    );

    const totalUsers = aggregate.reduce((acc, metrics) => acc + metrics.userCount, 0);
    const activeSessions = aggregate.reduce((acc, metrics) => acc + metrics.sessionCount, 0);

    return {
      totalTenants,
      activeTenants: activeTenants.length,
      suspendedTenants: suspendedTenants.length,
      totalUsers,
      activeSessions,
      connections: tenantManager.getStats()
    };
  }

  /**
   * Log admin action for audit
   */
  async logAuditAction(
    adminUserId: string,
    action: string,
    targetType: string,
    targetId: string,
    details: Record<string, any> = {},
    ipAddress?: string
  ): Promise<void> {
    await publicPool.query(`
      INSERT INTO authcore_system.audit_actions (
        admin_user_id, action, target_type, target_id, details, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [adminUserId, action, targetType, targetId, JSON.stringify(details), ipAddress || null]);
  }

  async getAuditLogs(limit: number, offset: number): Promise<{ logs: AuditLogEntry[]; total: number }> {
    try {
      const logsResult = await publicPool.query<AuditLogEntry>(`
        SELECT id, admin_user_id, action, target_type, target_id, details, ip_address, created_at
        FROM authcore_system.audit_actions
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      const countResult = await publicPool.query<{ total: string }>(`
        SELECT COUNT(*) as total FROM authcore_system.audit_actions
      `);

      const logs = logsResult.rows.map(log => {
        let details: Record<string, any> = {};

        if (typeof log.details === 'object' && log.details !== null) {
          details = log.details as Record<string, any>;
        } else if (log.details) {
          try {
            details = JSON.parse(String(log.details));
          } catch (parseError) {
            console.warn('[TenantService] Failed to parse audit log details', parseError);
            details = { raw: String(log.details) };
          }
        }

        return {
          ...log,
          details,
        };
      });

      return {
        logs,
        total: parseInt(countResult.rows[0]?.total ?? '0', 10)
      };
    } catch (error: any) {
      if (error?.code === '42P01') {
        console.warn('[TenantService] Audit log table not found. Returning empty result.');
        return { logs: [], total: 0 };
      }

      throw error;
    }
  }
}

// Export singleton instance
export const tenantService = new TenantService();
