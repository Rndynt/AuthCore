import type { CreateTenantInput, Tenant, TenantStatus, TenantStatusSnapshot } from '../domain/tenant/tenant';

export interface TenantRepository {
  listTenants(): Promise<Tenant[]>;
  getTenant(tenantId: string): Promise<Tenant | null>;

  /**
   * Insert a new tenant row in 'provisioning' status.
   * Schema provisioning is done externally by TenantSchemaProvisioner.
   */
  createProvisioningTenant(input: CreateTenantInput & { schemaName: string }): Promise<Tenant>;

  /**
   * Flip a tenant from 'provisioning' to 'active'.
   * Called by CreateTenantUseCase after schema is ready.
   */
  markTenantActive(tenantId: string): Promise<Tenant>;

  /**
   * Legacy combined create-and-provision path.
   * Kept for backward compatibility; prefer the two-step methods above.
   */
  createTenant(input: CreateTenantInput & { schemaName: string }): Promise<Tenant>;

  updateTenantStatus(tenantId: string, status: TenantStatus): Promise<Tenant | null>;
  getTenantStatusSnapshot(): Promise<TenantStatusSnapshot[]>;
}
