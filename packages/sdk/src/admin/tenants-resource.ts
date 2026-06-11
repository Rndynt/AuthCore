import type { RealmioAdminClient } from '../realmio-admin-client';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'deleted' | 'provisioning' | 'failed';
  schemaName: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTenantInput { id: string; name: string; slug: string }

export class TenantsResource {
  constructor(private readonly client: RealmioAdminClient) {}

  async list(): Promise<Tenant[]> {
    const data = await this.client.get<{ tenants: Tenant[] }>('/admin/api/tenants');
    return data.tenants;
  }

  async get(tenantId: string): Promise<Tenant> {
    const data = await this.client.get<{ tenant: Tenant }>(`/admin/api/tenants/${tenantId}`);
    return data.tenant;
  }

  async create(input: CreateTenantInput): Promise<Tenant> {
    const data = await this.client.post<{ tenant: Tenant }>('/admin/api/tenants', input);
    return data.tenant;
  }

  async suspend(tenantId: string): Promise<void> {
    await this.client.post(`/admin/api/tenants/${tenantId}/suspend`, {});
  }

  async activate(tenantId: string): Promise<void> {
    await this.client.post(`/admin/api/tenants/${tenantId}/activate`, {});
  }

  async delete(tenantId: string): Promise<void> {
    await this.client.delete(`/admin/api/tenants/${tenantId}`);
  }

  async metrics(tenantId: string): Promise<unknown> {
    return this.client.get(`/admin/api/tenants/${tenantId}/metrics`);
  }
}
