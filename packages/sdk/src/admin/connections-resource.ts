import type { RealmioAdminClient } from '../realmio-admin-client';

export class ConnectionsResource {
  constructor(private readonly client: RealmioAdminClient) {}

  async prune(force?: boolean): Promise<{ pruned: number }> {
    return this.client.post<{ pruned: number }>('/admin/api/connections/prune', { force: Boolean(force) });
  }
}
