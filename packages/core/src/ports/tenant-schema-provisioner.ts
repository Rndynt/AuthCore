import type { Tenant } from '../domain/tenant/tenant';
export interface TenantSchemaProvisioner { provisionTenantSchema(tenant: Tenant): Promise<void>; }
