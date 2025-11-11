/**
 * Tenant Management Service
 * Handles CRUD operations on public.tenants
 * Orchestrates tenant provisioning and lifecycle
 */

import { randomUUID } from 'crypto';
import pkg from 'pg';
const { Pool } = pkg;
import type { PoolClient } from 'pg';
import { tenantManager } from '../multi-tenant/connection-manager.js';
import { clearTenantAuthCache, getAuthStats } from '../multi-tenant/auth-factory.js';
import { devEnabled, trustedOrigins } from '../env.js';

const TENANT_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;

export class TenantValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantValidationError';
  }
}

// Connection to public schema
const publicPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  schema_name: string;
  status: 'active' | 'suspended' | 'deleted' | 'provisioning' | 'failed';
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTenantInput {
  id: string;
  name: string;
  slug: string;
}

export interface TenantMetrics {
  userCount: number;
  sessionCount: number;
  organizationCount: number;
}

export interface CrossTenantUserSummary {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  user: {
    id: string;
    email: string;
    name?: string | null;
    role?: string | null;
    banned?: boolean | null;
    createdAt: Date;
    updatedAt: Date;
  };
  sessionCount: number;
  organizations: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

export interface SecuritySettings {
  trustedOrigins: string[];
  enableDevEndpoints: boolean;
  apiKeyRotationDays: number | null;
  adminIpAllowlist: string[];
  enforceAdminMfa: boolean;
  readOnlyMode: boolean;
}

export interface SupportSessionSummary {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  sessionId: string;
  token: string;
  userId: string;
  userEmail: string;
  createdAt: Date;
  expiresAt: Date;
}

const SUPPORT_SESSION_MARKER = 'admin_support';

export interface AuditLogEntry {
  id: number;
  admin_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, any>;
  ip_address: string | null;
  created_at: Date;
  tenant_id?: string | null;
  tenant_name?: string | null;
  tenant_status?: string | null;
}

function normalizeTenantIdentifier(value: string, field: 'id' | 'slug'): string {
  const normalized = value.trim().toLowerCase();

  if (!TENANT_IDENTIFIER_PATTERN.test(normalized)) {
    throw new TenantValidationError(
      `Invalid tenant ${field}. Use lowercase letters, numbers, dashes, or underscores (1-63 characters).`
    );
  }

  return normalized;
}

export class TenantService {
  private adminSettingsInitialized = false;

  private async ensureAdminSettingsTable(): Promise<void> {
    if (this.adminSettingsInitialized) {
      return;
    }

    await publicPool.query(`
      CREATE TABLE IF NOT EXISTS authcore_system.admin_settings (
        id INTEGER PRIMARY KEY,
        settings JSONB NOT NULL,
        updated_by TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    this.adminSettingsInitialized = true;
  }

  /**
   * List all tenants
   */
  async listTenants(): Promise<Tenant[]> {
    const result = await publicPool.query<Tenant>(`
      SELECT * FROM public.tenants 
      ORDER BY created_at DESC
    `);
    return result.rows;
  }

  /**
   * Get single tenant by ID
   */
  async getTenant(tenantId: string): Promise<Tenant | null> {
    const result = await publicPool.query<Tenant>(`
      SELECT * FROM public.tenants 
      WHERE id = $1
    `, [tenantId]);
    
    return result.rows[0] || null;
  }

  /**
   * Create new tenant and provision schema
   */
  async createTenant(input: CreateTenantInput): Promise<Tenant> {
    const tenantId = normalizeTenantIdentifier(input.id, 'id');
    const tenantSlug = normalizeTenantIdentifier(input.slug, 'slug');
    const schemaSuffix = tenantId.replace(/-/g, '_');
    const schemaName = `tenant_${schemaSuffix}`;

    const client = await publicPool.connect();

    try {
      await client.query('BEGIN');

      // Ensure identifiers are available within the transaction scope
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM public.tenants WHERE id = $1 OR slug = $2 LIMIT 1`,
        [tenantId, tenantSlug]
      );

      if ((existing.rowCount ?? 0) > 0) {
        throw new TenantValidationError('Tenant with the provided id or slug already exists.');
      }

      const inserted = await client.query<Tenant>(`
        INSERT INTO public.tenants (id, name, slug, schema_name, status, metadata)
        VALUES ($1, $2, $3, $4, 'provisioning', '{}'::jsonb)
        RETURNING *
      `, [tenantId, input.name, tenantSlug, schemaName]);

      const tenantRow = inserted.rows[0];

      console.log(`[TenantService] Created tenant registry entry: ${tenantRow.id}`);

      // Provision schema within the same transaction
      await this.provisionTenantSchema(client, tenantRow);

      const activated = await client.query<Tenant>(`
        UPDATE public.tenants
        SET
          status = 'active',
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'provisioned_at', NOW(),
            'schema', schema_name
          ),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [tenantId]);

      await client.query('COMMIT');

      const tenant = activated.rows[0];

      const tenantRecord: Tenant = {
        ...tenant,
        slug: tenantSlug,
        id: tenantId,
        schema_name: schemaName,
        metadata: tenant.metadata || {}
      };

      clearTenantAuthCache(tenantRecord.id);
      await tenantManager.registerTenant(tenantRecord);

      console.log(`[TenantService] ✅ Tenant ${tenantRecord.id} provisioned successfully`);

      return tenantRecord;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error(`[TenantService] ❌ Provisioning failed for ${tenantId}:`, error);

      if (error instanceof TenantValidationError) {
        throw error;
      }

      throw new Error('Tenant provisioning failed. Check logs for details and retry.');
    } finally {
      client.release();
    }
  }

  /**
   * Provision tenant schema (clone Better Auth tables)
   */
  private async provisionTenantSchema(client: PoolClient, tenant: Tenant): Promise<void> {
    console.log(`[TenantService] Provisioning schema: ${tenant.schema_name}`);

    const betterAuthTables = [
      'users', 'accounts', 'sessions', 'verificationtokens',
      'api_keys', 'organizations', 'organization_members',
      'verification', 'member', 'invitation', 'apikey', 'jwks'
    ];

    try {
      // Create schema
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${tenant.schema_name}"`);
      console.log(`[TenantService] Schema created: ${tenant.schema_name}`);

      // Clone tables
      for (const table of betterAuthTables) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS "${tenant.schema_name}"."${table}"
          (LIKE "public"."${table}" INCLUDING ALL)
        `);
      }

      console.log(`[TenantService] Tables cloned for: ${tenant.schema_name}`);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Suspend tenant
   */
  async suspendTenant(tenantId: string): Promise<void> {
    const result = await publicPool.query<Tenant>(`
      UPDATE public.tenants
      SET status = 'suspended', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [tenantId]);

    const tenant = result.rows[0];
    if (!tenant) {
      throw new TenantValidationError(`Tenant not found: ${tenantId}`);
    }

    clearTenantAuthCache(tenantId);
    await tenantManager.registerTenant({
      ...tenant,
      metadata: tenant.metadata || {}
    });

    console.log(`[TenantService] Tenant ${tenantId} suspended`);
  }

  /**
   * Activate tenant
   */
  async activateTenant(tenantId: string): Promise<void> {
    const result = await publicPool.query<Tenant>(`
      UPDATE public.tenants
      SET status = 'active', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [tenantId]);

    const tenant = result.rows[0];
    if (!tenant) {
      throw new TenantValidationError(`Tenant not found: ${tenantId}`);
    }

    clearTenantAuthCache(tenantId);
    await tenantManager.registerTenant({
      ...tenant,
      metadata: tenant.metadata || {}
    });

    console.log(`[TenantService] Tenant ${tenantId} activated`);
  }

  /**
   * Delete tenant (soft delete)
   */
  async deleteTenant(tenantId: string): Promise<void> {
    const result = await publicPool.query<Tenant>(`
      UPDATE public.tenants
      SET status = 'deleted', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [tenantId]);

    const tenant = result.rows[0];
    if (!tenant) {
      throw new TenantValidationError(`Tenant not found: ${tenantId}`);
    }

    clearTenantAuthCache(tenantId);
    await tenantManager.registerTenant({
      ...tenant,
      metadata: tenant.metadata || {}
    });

    console.log(`[TenantService] Tenant ${tenantId} deleted (soft)`);
  }

  /**
   * Get tenant metrics
   */
  async getTenantMetrics(tenantId: string): Promise<TenantMetrics> {
    try {
      const client = tenantManager.getClient(tenantId);
      
      const [userCount, sessionCount, orgCount] = await Promise.all([
        client.user.count(),
        client.session.count({
          where: { expiresAt: { gt: new Date() } }
        }),
        client.organization.count()
      ]);
      
      return {
        userCount,
        sessionCount,
        organizationCount: orgCount
      };
    } catch (error) {
      console.error(`[TenantService] Metrics error for ${tenantId}:`, error);
      return {
        userCount: 0,
        sessionCount: 0,
        organizationCount: 0
      };
    }
  }

  async searchUsersAcrossTenants(options: {
    query?: string;
    tenantId?: string;
    limit?: number;
  }): Promise<CrossTenantUserSummary[]> {
    const searchTerm = options.query?.trim();
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);

    const targetTenants = options.tenantId
      ? (() => {
          const tenant = tenantManager.resolveTenant(options.tenantId!);
          if (!tenant) {
            throw new TenantValidationError(`Tenant not found: ${options.tenantId}`);
          }
          return [tenant];
        })()
      : tenantManager.getAllTenants().filter(t => t.status === 'active');

    const summaries: CrossTenantUserSummary[] = [];

    for (const tenant of targetTenants) {
      if (tenant.status !== 'active') {
        continue;
      }

      if (summaries.length >= limit) {
        break;
      }

      try {
        const client = tenantManager.getClient(tenant.id);

        const where: any = {};
        if (searchTerm) {
          where.OR = [
            { email: { contains: searchTerm, mode: 'insensitive' } },
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { id: searchTerm }
          ];
        }

        const users = await client.user.findMany({
          where,
          take: Math.max(Math.min(limit - summaries.length, limit), 1),
          orderBy: { createdAt: 'desc' }
        });

        const [memberships, sessionCounts] = await Promise.all([
          Promise.all(
            users.map(user =>
              client.organizationMember.findMany({
                where: { userId: user.id },
                select: {
                  role: true,
                  organization: {
                    select: {
                      id: true,
                      name: true
                    }
                  }
                }
              })
            )
          ),
          Promise.all(
            users.map(user =>
              client.session.count({
                where: {
                  userId: user.id,
                  expiresAt: { gt: new Date() }
                }
              })
            )
          )
        ]);

        users.forEach((user, index) => {
          if (summaries.length >= limit) {
            return;
          }

          summaries.push({
            tenantId: tenant.id,
            tenantName: tenant.name,
            tenantSlug: tenant.slug,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              banned: user.banned,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt
            },
            sessionCount: sessionCounts[index] ?? 0,
            organizations: memberships[index]?.map(member => ({
              id: member.organization.id,
              name: member.organization.name,
              role: member.role
            })) || []
          });
        });

        if (summaries.length >= limit) {
          break;
        }
      } catch (error) {
        console.error(`[TenantService] Cross-tenant user search failed for ${tenant.id}:`, error);
      }
    }

    return summaries;
  }

  async revokeUserSessions(tenantId: string, userId: string): Promise<number> {
    try {
      const client = tenantManager.getClient(tenantId);
      const result = await client.session.deleteMany({
        where: { userId }
      });
      return result.count;
    } catch (error) {
      console.error(`[TenantService] Failed to revoke sessions for ${tenantId}/${userId}:`, error);
      throw new Error('Failed to revoke user sessions');
    }
  }

  async createSupportSession(tenantId: string, userId: string, minutes = 30) {
    try {
      const client = tenantManager.getClient(tenantId);
      const expiresAt = new Date(Date.now() + Math.max(minutes, 1) * 60 * 1000);
      const token = `support_${randomUUID()}`;

      const session = await client.session.create({
        data: {
          id: randomUUID(),
          token,
          userId,
          expiresAt,
          impersonatedBy: SUPPORT_SESSION_MARKER
        }
      });

      return {
        token: session.token,
        expiresAt: session.expiresAt
      };
    } catch (error) {
      console.error(`[TenantService] Failed to create support session for ${tenantId}/${userId}:`, error);
      throw new Error('Failed to create support session');
    }
  }

  async listActiveSupportSessions(): Promise<SupportSessionSummary[]> {
    const tenants = tenantManager.getAllTenants().filter(t => t.status === 'active');
    const summaries: SupportSessionSummary[] = [];
    const now = new Date();

    for (const tenant of tenants) {
      try {
        const client = tenantManager.getClient(tenant.id);
        const sessions = await client.session.findMany({
          where: {
            impersonatedBy: SUPPORT_SESSION_MARKER,
            expiresAt: { gt: now }
          },
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            }
          }
        });

        for (const session of sessions) {
          summaries.push({
            tenantId: tenant.id,
            tenantName: tenant.name,
            tenantSlug: tenant.slug,
            sessionId: session.id,
            token: session.token,
            userId: session.userId,
            userEmail: session.user?.email ?? 'unknown',
            createdAt: session.createdAt,
            expiresAt: session.expiresAt
          });
        }
      } catch (error) {
        console.error(`[TenantService] Failed to list support sessions for ${tenant.id}:`, error);
      }
    }

    return summaries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async revokeSupportSession(tenantId: string, sessionId: string): Promise<boolean> {
    try {
      const client = tenantManager.getClient(tenantId);
      const result = await client.session.deleteMany({
        where: {
          id: sessionId,
          impersonatedBy: SUPPORT_SESSION_MARKER
        }
      });
      return result.count > 0;
    } catch (error) {
      console.error(`[TenantService] Failed to revoke support session ${sessionId} for ${tenantId}:`, error);
      throw new Error('Failed to revoke support session');
    }
  }

  async pruneIdleConnections(force = false): Promise<{ pruned: number }> {
    try {
      const pruned = await tenantManager.pruneIdleConnectionsNow({ force });
      return { pruned };
    } catch (error) {
      console.error('[TenantService] Failed to prune idle connections:', error);
      throw new Error('Failed to prune idle connections');
    }
  }

  /**
   * Get system-wide metrics
   */
  async getSystemMetrics() {
    const result = await publicPool.query<{ id: string; status: string }>(`
      SELECT id, status FROM public.tenants
    `);

    const tenants = result.rows;
    const totalTenants = tenants.length;
    const activeTenants = tenants.filter(t => t.status === 'active');
    const suspendedTenants = tenants.filter(t => t.status === 'suspended');
    const provisioningTenants = tenants.filter(t => t.status === 'provisioning');
    const failedTenants = tenants.filter(t => t.status === 'failed');

    const aggregate = await Promise.all(
      activeTenants.map(async tenant => this.getTenantMetrics(tenant.id))
    );

    const totalUsers = aggregate.reduce((acc, metrics) => acc + metrics.userCount, 0);
    const activeSessions = aggregate.reduce((acc, metrics) => acc + metrics.sessionCount, 0);

    return {
      totalTenants,
      activeTenants: activeTenants.length,
      suspendedTenants: suspendedTenants.length,
      provisioningTenants: provisioningTenants.length,
      failedTenants: failedTenants.length,
      totalUsers,
      activeSessions,
      connections: tenantManager.getStats()
    };
  }

  async getAdminOverview() {
    const [metrics, authCache] = await Promise.all([
      this.getSystemMetrics(),
      Promise.resolve(getAuthStats())
    ]);

    return {
      generatedAt: new Date().toISOString(),
      metrics,
      authCache
    };
  }

  private getDefaultSecuritySettings(): SecuritySettings {
    return {
      trustedOrigins,
      enableDevEndpoints: devEnabled,
      apiKeyRotationDays: null,
      adminIpAllowlist: [],
      enforceAdminMfa: false,
      readOnlyMode: false
    };
  }

  async getSecuritySettings(): Promise<SecuritySettings> {
    await this.ensureAdminSettingsTable();

    const result = await publicPool.query<{ settings: any }>(`
      SELECT settings FROM authcore_system.admin_settings WHERE id = 1
    `);

    if ((result.rowCount ?? 0) === 0) {
      return this.getDefaultSecuritySettings();
    }

    const stored = result.rows[0]?.settings || {};
    const defaults = this.getDefaultSecuritySettings();

    const normalizeStringArray = (value: unknown, fallback: string[] = []) => Array.isArray(value)
      ? Array.from(new Set(value.map(item => String(item).trim()).filter(Boolean)))
      : fallback;

    const merged: SecuritySettings = {
      trustedOrigins: Array.isArray(stored.trustedOrigins)
        ? Array.from(new Set(stored.trustedOrigins.map((origin: string) => String(origin).trim()).filter(Boolean)))
        : defaults.trustedOrigins,
      enableDevEndpoints: typeof stored.enableDevEndpoints === 'boolean'
        ? stored.enableDevEndpoints
        : defaults.enableDevEndpoints,
      apiKeyRotationDays: typeof stored.apiKeyRotationDays === 'number'
        ? stored.apiKeyRotationDays
        : defaults.apiKeyRotationDays,
      adminIpAllowlist: normalizeStringArray(stored.adminIpAllowlist, defaults.adminIpAllowlist),
      enforceAdminMfa: typeof stored.enforceAdminMfa === 'boolean'
        ? stored.enforceAdminMfa
        : defaults.enforceAdminMfa,
      readOnlyMode: typeof stored.readOnlyMode === 'boolean'
        ? stored.readOnlyMode
        : defaults.readOnlyMode
    };

    return merged;
  }

  async updateSecuritySettings(
    adminUserId: string,
    updates: Partial<SecuritySettings>
  ): Promise<SecuritySettings> {
    await this.ensureAdminSettingsTable();

    const current = await this.getSecuritySettings();

    const trusted = updates.trustedOrigins
      ? Array.from(new Set(
          updates.trustedOrigins
            .map(origin => origin.trim())
            .filter(Boolean)
        ))
      : current.trustedOrigins;

    const rotation = updates.apiKeyRotationDays === null
      ? null
      : typeof updates.apiKeyRotationDays === 'number'
        ? Math.max(0, Math.floor(updates.apiKeyRotationDays))
        : current.apiKeyRotationDays;

    const adminIpAllowlist = updates.adminIpAllowlist
      ? Array.from(new Set(updates.adminIpAllowlist.map(ip => ip.trim()).filter(Boolean)))
      : current.adminIpAllowlist;

    const payload: SecuritySettings = {
      trustedOrigins: trusted.length ? trusted : current.trustedOrigins,
      enableDevEndpoints: typeof updates.enableDevEndpoints === 'boolean'
        ? updates.enableDevEndpoints
        : current.enableDevEndpoints,
      apiKeyRotationDays: rotation,
      adminIpAllowlist,
      enforceAdminMfa: typeof updates.enforceAdminMfa === 'boolean'
        ? updates.enforceAdminMfa
        : current.enforceAdminMfa,
      readOnlyMode: typeof updates.readOnlyMode === 'boolean'
        ? updates.readOnlyMode
        : current.readOnlyMode
    };

    await publicPool.query(`
      INSERT INTO authcore_system.admin_settings (id, settings, updated_by, updated_at)
      VALUES (1, $1::jsonb, $2, NOW())
      ON CONFLICT (id) DO UPDATE SET
        settings = EXCLUDED.settings,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at
    `, [JSON.stringify(payload), adminUserId]);

    return payload;
  }

  /**
   * Log admin action for audit
   */
  async logAuditAction(
    adminUserId: string,
    action: string,
    targetType: string,
    targetId: string,
    details: Record<string, any> = {},
    ipAddress?: string
  ): Promise<void> {
    await publicPool.query(`
      INSERT INTO authcore_system.audit_actions (
        admin_user_id, action, target_type, target_id, details, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [adminUserId, action, targetType, targetId, JSON.stringify(details), ipAddress || null]);
  }

  async getAuditLogs(
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
  ): Promise<{ logs: AuditLogEntry[]; total: number }> {
    try {
      const tenantIdExpr = `(
        CASE
          WHEN a.target_type = 'tenant' THEN a.target_id
          WHEN a.target_type = 'user' THEN split_part(a.target_id, ':', 1)
          WHEN a.details ? 'tenantId' THEN a.details->>'tenantId'
          ELSE NULL
        END
      )`;

      const conditions: string[] = [];
      const values: any[] = [];

      if (filters?.action) {
        values.push(filters.action);
        conditions.push(`a.action = $${values.length}`);
      }

      if (filters?.targetType) {
        values.push(filters.targetType);
        conditions.push(`a.target_type = $${values.length}`);
      }

      if (filters?.targetId) {
        values.push(filters.targetId);
        conditions.push(`a.target_id = $${values.length}`);
      }

      if (filters?.adminUserId) {
        values.push(filters.adminUserId);
        conditions.push(`a.admin_user_id = $${values.length}`);
      }

      if (filters?.from) {
        const fromDate = new Date(filters.from);
        if (!Number.isNaN(fromDate.getTime())) {
          values.push(fromDate);
          conditions.push(`a.created_at >= $${values.length}`);
        }
      }

      if (filters?.to) {
        const toDate = new Date(filters.to);
        if (!Number.isNaN(toDate.getTime())) {
          values.push(toDate);
          conditions.push(`a.created_at <= $${values.length}`);
        }
      }

      if (filters?.search) {
        const normalized = `%${filters.search.trim().toLowerCase()}%`;
        values.push(normalized);
        const placeholder = `$${values.length}`;
        conditions.push(`(LOWER(a.action) LIKE ${placeholder} OR LOWER(a.target_id) LIKE ${placeholder} OR LOWER(CAST(a.details AS TEXT)) LIKE ${placeholder})`);
      }

      if (filters?.tenantStatus) {
        values.push(filters.tenantStatus);
        conditions.push(`EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = ${tenantIdExpr} AND t.status = $${values.length})`);
      }

      const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      const countResult = await publicPool.query<{ total: string }>(`
        SELECT COUNT(*) as total
        FROM authcore_system.audit_actions a
        ${whereClause}
      `, values);

      const dataValues = [...values, limit, offset];
      const logsResult = await publicPool.query<AuditLogEntry>(`
        SELECT
          a.id,
          a.admin_user_id,
          a.action,
          a.target_type,
          a.target_id,
          a.details,
          a.ip_address,
          a.created_at,
          ${tenantIdExpr} AS tenant_id,
          tenants.name AS tenant_name,
          tenants.status AS tenant_status
        FROM authcore_system.audit_actions a
        LEFT JOIN public.tenants tenants ON tenants.id = ${tenantIdExpr}
        ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `, dataValues);

      const logs = logsResult.rows.map(log => {
        let details: Record<string, any> = {};

        if (typeof log.details === 'object' && log.details !== null) {
          details = log.details as Record<string, any>;
        } else if (log.details) {
          try {
            details = JSON.parse(String(log.details));
          } catch (parseError) {
            console.warn('[TenantService] Failed to parse audit log details', parseError);
            details = { raw: String(log.details) };
          }
        }

        return {
          ...log,
          details
        };
      });

      return {
        logs,
        total: parseInt(countResult.rows[0]?.total ?? '0', 10)
      };
    } catch (error: any) {
      if (error?.code === '42P01') {
        console.warn('[TenantService] Audit log table not found. Returning empty result.');
        return { logs: [], total: 0 };
      }

      throw error;
    }
  }
}

// Export singleton instance
export const tenantService = new TenantService();
