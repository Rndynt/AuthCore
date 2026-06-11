import type { RealmioAdminClient } from '../realmio-admin-client';

export interface AuditLogEntry {
  id: string;
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

export interface AuditLogFilters {
  action?: string;
  targetType?: string;
  targetId?: string;
  adminUserId?: string;
  from?: string;
  to?: string;
  search?: string;
}

export class AuditResource {
  constructor(private readonly client: RealmioAdminClient) {}

  async list(
    opts: { limit?: number; offset?: number } & AuditLogFilters = {},
  ): Promise<{ logs: AuditLogEntry[]; total: number }> {
    const { limit = 50, offset = 0, ...filters } = opts;
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined) params.set(k, String(v));
    }
    return this.client.get(`/admin/api/audit-logs?${params.toString()}`);
  }
}
