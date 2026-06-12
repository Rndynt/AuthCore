import type { RealmioAdminClient } from '../realmio-admin-client';

export interface AdminSession {
  user: { id: string; email: string; name?: string; role?: string } | null;
  session: { id: string; expiresAt: string } | null;
}

export class AdminAuthResource {
  constructor(private readonly client: RealmioAdminClient) {}

  async getSession(): Promise<AdminSession> {
    return this.client.get<AdminSession>('/admin/auth/get-session');
  }

  async login(email: string, password: string): Promise<AdminSession> {
    return this.client.post<AdminSession>('/admin/auth/sign-in/email', { email, password });
  }

  async logout(): Promise<void> {
    await this.client.post('/admin/auth/sign-out', {});
  }
}
