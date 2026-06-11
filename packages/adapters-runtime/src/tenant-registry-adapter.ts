import { tenantManager } from '../../../src/multi-tenant/connection-manager.js';
import type { TenantRegistry } from '../../core/src/ports/tenant-registry';
import type { Tenant } from '../../core/src/domain/tenant/tenant';

/**
 * TenantRegistryAdapter
 *
 * Implements the TenantRegistry port by delegating to the TenantConnectionManager
 * singleton, which is the authoritative in-memory registry for all active tenants.
 */
export class TenantRegistryAdapter implements TenantRegistry {
  async initialize(): Promise<void> {
    return tenantManager.initialize();
  }

  resolveTenant(identifier: string): Tenant | undefined {
    const t = tenantManager.resolveTenant(identifier);
    if (!t) return undefined;
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      schemaName: t.schema_name,
      status: t.status as Tenant['status'],
      metadata: (t.metadata ?? {}) as Record<string, unknown>,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    };
  }

  getTenant(tenantId: string): Tenant | undefined {
    const t = tenantManager.getTenant(tenantId);
    if (!t) return undefined;
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      schemaName: t.schema_name,
      status: t.status as Tenant['status'],
      metadata: (t.metadata ?? {}) as Record<string, unknown>,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    };
  }

  getAllTenants(): Tenant[] {
    return tenantManager.getAllTenants().map(t => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      schemaName: t.schema_name,
      status: t.status as Tenant['status'],
      metadata: (t.metadata ?? {}) as Record<string, unknown>,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));
  }

  async registerTenant(tenant: Tenant): Promise<void> {
    return tenantManager.registerTenant({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      schema_name: tenant.schemaName,
      status: tenant.status,
      metadata: tenant.metadata,
      created_at: tenant.createdAt,
      updated_at: tenant.updatedAt,
    } as any);
  }

  async removeTenant(tenantId: string): Promise<void> {
    return tenantManager.removeTenant(tenantId);
  }

  getStats(): unknown {
    return tenantManager.getStats();
  }
}

export const tenantRegistryAdapter = new TenantRegistryAdapter();
