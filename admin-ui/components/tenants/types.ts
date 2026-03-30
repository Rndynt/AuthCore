export interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'deleted' | 'provisioning' | 'failed';
  schemaName?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}
