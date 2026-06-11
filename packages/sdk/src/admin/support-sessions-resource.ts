import type { RealmioAdminClient } from '../realmio-admin-client';

export interface SupportSession {
  id: string;
  tenantId: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

export class SupportSessionsResource {
  constructor(private readonly client: RealmioAdminClient) {}

  async list(): Promise<SupportSession[]> {
    const data = await this.client.get<{ sessions: SupportSession[] }>('/admin/api/support-sessions');
    return data.sessions;
  }

  async revoke(tenantId: string, sessionId: string): Promise<boolean> {
    const data = await this.client.delete<{ revoked: boolean }>(
      `/admin/api/support-sessions/${tenantId}/${sessionId}`,
    );
    return data.revoked;
  }
}
