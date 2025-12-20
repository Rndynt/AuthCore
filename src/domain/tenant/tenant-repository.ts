import type { AuditLogEntry } from './audit-log.js';
import type { SecuritySettings } from './security-settings.js';
import type { CreateTenantInput, Tenant, TenantStatus } from './tenant.js';

export interface TenantRepository {
  listTenants(): Promise<Tenant[]>;
  getTenant(tenantId: string): Promise<Tenant | null>;
  createTenant(input: CreateTenantInput & { schemaName: string }): Promise<Tenant>;
  updateTenantStatus(tenantId: string, status: TenantStatus): Promise<Tenant | null>;
  getTenantStatusSnapshot(): Promise<Array<{ id: string; status: TenantStatus }>>;
  ensureAdminSettingsTable(): Promise<void>;
  getSecuritySettings(): Promise<SecuritySettings | null>;
  updateSecuritySettings(adminUserId: string, settings: SecuritySettings): Promise<void>;
  logAuditAction(
    adminUserId: string,
    action: string,
    targetType: string,
    targetId: string,
    details?: Record<string, any>,
    ipAddress?: string
  ): Promise<void>;
  getAuditLogs(
    limit: number,
    offset: number,
    filters?: {
      action?: string;
      targetType?: string;
      targetId?: string;
      adminUserId?: string;
      from?: string;
      to?: string;
      search?: string;
      tenantStatus?: string;
    }
  ): Promise<{ logs: AuditLogEntry[]; total: number }>;
}
