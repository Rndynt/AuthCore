export type TenantStatus = 'active' | 'suspended' | 'deleted' | 'provisioning' | 'failed';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  status: TenantStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTenantInput {
  id: string;
  name: string;
  slug: string;
}

export interface TenantStatusSnapshot {
  id: string;
  status: TenantStatus;
}
