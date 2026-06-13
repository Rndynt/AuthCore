import { tenantManager } from './tenant-connection-manager-impl.js';
import type { TenantRegistry } from '../../core/src/ports/tenant-registry';
import type { Tenant } from '../../core/src/domain/tenant/tenant';

export class TenantRegistryAdapter implements TenantRegistry {
  async initialize(): Promise<void>      { return tenantManager.initialize(); }

  resolveTenant(identifier: string): Tenant | undefined {
    const t = tenantManager.resolveTenant(identifier);
    return t ? rowToDomain(t) : undefined;
  }
  getTenant(tenantId: string): Tenant | undefined {
    const t = tenantManager.getTenant(tenantId);
    return t ? rowToDomain(t) : undefined;
  }
  getAllTenants(): Tenant[]               { return tenantManager.getAllTenants().map(rowToDomain); }
  async registerTenant(tenant: Tenant): Promise<void> {
    return tenantManager.registerTenant(domainToRow(tenant) as any);
  }
  async removeTenant(tenantId: string): Promise<void> { return tenantManager.removeTenant(tenantId); }
  getStats(): unknown { return tenantManager.getStats(); }
}

function rowToDomain(t: any): Tenant {
  return {
    id: t.id, name: t.name, slug: t.slug,
    schemaName: t.schema_name ?? t.schemaName,
    status: t.status as Tenant['status'],
    metadata: t.metadata ?? {},
    createdAt: t.created_at ?? t.createdAt,
    updatedAt: t.updated_at ?? t.updatedAt,
  };
}
function domainToRow(t: Tenant): object {
  return {
    id: t.id, name: t.name, slug: t.slug,
    schema_name: t.schemaName,
    status: t.status, metadata: t.metadata,
    created_at: t.createdAt, updated_at: t.updatedAt,
  };
}

export const tenantRegistryAdapter = new TenantRegistryAdapter();
