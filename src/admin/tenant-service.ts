/**
 * Tenant Management Service
 * Handles CRUD operations on public.tenants
 * Orchestrates tenant provisioning and lifecycle
 */

import { Pool } from 'pg';
import { tenantManager } from '../multi-tenant/connection-manager.js';
import { spawn } from 'child_process';

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
    const schemaName = `tenant_${input.id}`;
    
    // 1. Insert to public.tenants
    const result = await publicPool.query<Tenant>(`
      INSERT INTO public.tenants (id, name, slug, schema_name, status, metadata)
      VALUES ($1, $2, $3, $4, 'active', '{}')
      RETURNING *
    `, [input.id, input.name, input.slug, schemaName]);
    
    const tenant = result.rows[0];
    
    console.log(`[TenantService] Created tenant registry: ${tenant.id}`);
    
    // 2. Provision schema (async - fire and forget for now)
    this.provisionTenantSchema(tenant).catch(err => {
      console.error(`[TenantService] Provisioning failed for ${tenant.id}:`, err);
    });
    
    return tenant;
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
      
      // Reload tenant registry
      await tenantManager.reload();
      
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
    await publicPool.query(`
      UPDATE public.tenants 
      SET status = 'suspended', updated_at = NOW()
      WHERE id = $1
    `, [tenantId]);
    
    await tenantManager.reload();
    
    console.log(`[TenantService] Tenant ${tenantId} suspended`);
  }

  /**
   * Activate tenant
   */
  async activateTenant(tenantId: string): Promise<void> {
    await publicPool.query(`
      UPDATE public.tenants 
      SET status = 'active', updated_at = NOW()
      WHERE id = $1
    `, [tenantId]);
    
    await tenantManager.reload();
    
    console.log(`[TenantService] Tenant ${tenantId} activated`);
  }

  /**
   * Delete tenant (soft delete)
   */
  async deleteTenant(tenantId: string): Promise<void> {
    await publicPool.query(`
      UPDATE public.tenants 
      SET status = 'deleted', updated_at = NOW()
      WHERE id = $1
    `, [tenantId]);
    
    await tenantManager.reload();
    
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
    const result = await publicPool.query(`
      SELECT 
        COUNT(*) as total_tenants,
        COUNT(*) FILTER (WHERE status = 'active') as active_tenants,
        COUNT(*) FILTER (WHERE status = 'suspended') as suspended_tenants
      FROM public.tenants
    `);
    
    const stats = result.rows[0];
    
    return {
      totalTenants: parseInt(stats.total_tenants),
      activeTenants: parseInt(stats.active_tenants),
      suspendedTenants: parseInt(stats.suspended_tenants),
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
}

// Export singleton instance
export const tenantService = new TenantService();
