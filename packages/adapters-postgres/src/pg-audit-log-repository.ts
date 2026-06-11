import type { Pool } from 'pg';
import type { AuditLogEntry } from '../../core/src/domain/audit/audit-log';
import type { AuditLogRepository } from '../../core/src/ports/audit-log-repository';
import { createPgPool } from './pg-pool';

export class PgAuditLogRepository implements AuditLogRepository {
  constructor(private readonly pool: Pool = createPgPool()) {}
  async logAuditAction(adminUserId: string, action: string, targetType: string, targetId: string, details: Record<string, unknown> = {}, ipAddress?: string): Promise<void> { await this.pool.query(`INSERT INTO authcore_system.audit_actions (admin_user_id, action, target_type, target_id, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6)`, [adminUserId, action, targetType, targetId, JSON.stringify(details), ipAddress || null]); }
  async getAuditLogs(limit: number, offset: number, filters?: Record<string, unknown>): Promise<{ logs: AuditLogEntry[]; total: number }> {
    const tenantIdExpr = `(CASE WHEN a.target_type = 'tenant' THEN a.target_id WHEN a.target_type = 'user' THEN split_part(a.target_id, ':', 1) WHEN a.details ? 'tenantId' THEN a.details->>'tenantId' ELSE NULL END)`;
    const values: any[] = []; const conditions: string[] = [];
    for (const [field, column] of [['action','a.action'],['targetType','a.target_type'],['targetId','a.target_id'],['adminUserId','a.admin_user_id']] as const) { const v = filters?.[field]; if (v) { values.push(v); conditions.push(`${column} = $${values.length}`); } }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await this.pool.query<{ total: string }>(`SELECT COUNT(*) as total FROM authcore_system.audit_actions a ${where}`, values);
    const rows = await this.pool.query<AuditLogEntry>(`SELECT a.*, ${tenantIdExpr} AS tenant_id, tenants.name AS tenant_name, tenants.status AS tenant_status FROM authcore_system.audit_actions a LEFT JOIN public.tenants tenants ON tenants.id = ${tenantIdExpr} ${where} ORDER BY a.created_at DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`, [...values, limit, offset]);
    return { logs: rows.rows.map(log => ({ ...log, details: typeof log.details === 'object' && log.details !== null ? log.details : {} })), total: parseInt(count.rows[0]?.total ?? '0', 10) };
  }
}
