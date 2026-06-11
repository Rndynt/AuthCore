import type { RealmioAdminClient } from '../realmio-admin-client';

export interface AdminUserSearchResult {
  id: string;
  email: string;
  name: string | null;
  tenantId: string;
  createdAt: string;
}

export class UsersResource {
  constructor(private readonly client: RealmioAdminClient) {}

  async search(opts: { query?: string; tenantId?: string; limit?: number } = {}): Promise<AdminUserSearchResult[]> {
    const params = new URLSearchParams();
    if (opts.query) params.set('q', opts.query);
    if (opts.tenantId) params.set('tenantId', opts.tenantId);
    if (opts.limit) params.set('limit', String(opts.limit));
    const data = await this.client.get<{ users: AdminUserSearchResult[] }>(
      `/admin/api/users/search?${params.toString()}`,
    );
    return data.users;
  }

  async revokeSessions(tenantId: string, userId: string): Promise<void> {
    await this.client.post(`/admin/api/tenants/${tenantId}/users/${userId}/revoke-sessions`, {});
  }

  async createSupportSession(
    tenantId: string,
    userId: string,
    opts: { minutes?: number } = {},
  ): Promise<{ token: string; expiresAt: string }> {
    return this.client.post(
      `/admin/api/tenants/${tenantId}/users/${userId}/support-session`,
      opts,
    );
  }
}
