import type { CreateTenantInput, Tenant, TenantStatus, TenantStatusSnapshot } from '../domain/tenant/tenant';

export interface TenantRepository {
  listTenants(): Promise<Tenant[]>;
  getTenant(tenantId: string): Promise<Tenant | null>;
  createTenant(input: CreateTenantInput & { schemaName: string }): Promise<Tenant>;
  updateTenantStatus(tenantId: string, status: TenantStatus): Promise<Tenant | null>;
  getTenantStatusSnapshot(): Promise<TenantStatusSnapshot[]>;
}
