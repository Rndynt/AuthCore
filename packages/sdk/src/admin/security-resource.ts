import type { RealmioAdminClient } from '../realmio-admin-client';

export interface SecuritySettings {
  allowedOrigins: string[];
  requireEmailVerification: boolean;
  sessionDurationSecs: number;
  maxSessionsPerUser: number;
  updatedAt: string;
}

export interface IpBlockEntry {
  ip: string;
  reason: string;
  blockedBy: string;
  blockedAt: string;
  expiresAt: string | null;
}

export interface CreateIpBlockInput {
  ip: string;
  reason?: string;
  expiresInMs?: number;
}

export class SecurityResource {
  constructor(private readonly client: RealmioAdminClient) {}

  async getSettings(): Promise<SecuritySettings> {
    const data = await this.client.get<{ settings: SecuritySettings }>('/admin/api/security/settings');
    return data.settings;
  }

  async updateSettings(updates: Partial<SecuritySettings>): Promise<SecuritySettings> {
    const data = await this.client.put<{ settings: SecuritySettings }>('/admin/api/security/settings', updates);
    return data.settings;
  }

  async getIpBlocklist(): Promise<IpBlockEntry[]> {
    const data = await this.client.get<{ blocklist: IpBlockEntry[] }>('/admin/api/security/ip-blocklist');
    return data.blocklist;
  }

  async blockIp(input: CreateIpBlockInput): Promise<IpBlockEntry> {
    const data = await this.client.post<{ entry: IpBlockEntry }>('/admin/api/security/ip-blocklist', input);
    return data.entry;
  }

  async unblockIp(ip: string): Promise<boolean> {
    const data = await this.client.delete<{ success: boolean }>(
      `/admin/api/security/ip-blocklist/${encodeURIComponent(ip)}`,
    );
    return data.success;
  }

  async checkIp(ip: string): Promise<{ blocked: boolean; entry?: IpBlockEntry }> {
    return this.client.get(`/admin/api/security/ip-check/${encodeURIComponent(ip)}`);
  }
}
