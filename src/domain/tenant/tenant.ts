export type TenantStatus = 'active' | 'suspended' | 'deleted' | 'provisioning' | 'failed';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  schema_name: string;
  status: TenantStatus;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTenantInput {
  id: string;
  name: string;
  slug: string;
}
