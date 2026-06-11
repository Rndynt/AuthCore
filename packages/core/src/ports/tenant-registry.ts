import type { Tenant } from '../domain/tenant/tenant';
export interface TenantRegistry {
  initialize(): Promise<void>;
  resolveTenant(identifier: string): Tenant | undefined;
  getTenant(tenantId: string): Tenant | undefined;
  getAllTenants(): Tenant[];
  registerTenant(tenant: Tenant): Promise<void>;
  removeTenant(tenantId: string): Promise<void>;
}
