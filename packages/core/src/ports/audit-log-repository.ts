import type { AuditLogEntry } from '../domain/audit/audit-log';
export interface AuditLogRepository {
  logAuditAction(adminUserId: string, action: string, targetType: string, targetId: string, details?: Record<string, unknown>, ipAddress?: string): Promise<void>;
  getAuditLogs(limit: number, offset: number, filters?: Record<string, unknown>): Promise<{ logs: AuditLogEntry[]; total: number }>;
}
