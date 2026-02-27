/**
 * Tenant Management Service
 * Application layer orchestrator for tenant provisioning and lifecycle
 */

import { randomUUID } from 'crypto';
import { clearTenantAuthCache, getAuthStats } from '../multi-tenant/auth-factory.js';
import { tenantManager } from '../multi-tenant/connection-manager.js';
import { devEnabled, trustedOrigins } from '../env.js';
import type { AuditLogEntry } from '../domain/tenant/audit-log.js';
import { TenantValidationError } from '../domain/tenant/errors.js';
import type { SecuritySettings, IpBlockEntry, CreateIpBlockInput, UpdateSecuritySettingsInput, RateLimitSettings, DEFAULT_RATE_LIMIT_SETTINGS } from '../domain/tenant/security-settings.js';

import { buildTenantSchemaName, normalizeTenantIdentifier } from '../domain/tenant/services.js';
import type { CreateTenantInput, Tenant } from '../domain/tenant/tenant.js';
import type { TenantRepository } from '../domain/tenant/tenant-repository.js';
import { PgTenantRepository } from '../infrastructure/db/tenant-repository.js';

import { isIpInBlocklist, isValidIpOrCidr, normalizeIp, convertIpv4Mapped } from '../utils/ip-utils.js';
import { emitWebhookEvent } from '../utils/webhook.js';

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

export class TenantService {
  constructor(private repository: TenantRepository) {}

  /**
   * List all tenants
   */
  async listTenants(): Promise<Tenant[]> {
    return this.repository.listTenants();
  }

  /**
   * Get single tenant by ID
   */
  async getTenant(tenantId: string): Promise<Tenant | null> {
    return this.repository.getTenant(tenantId);
  }

  /**
   * Create new tenant and provision schema
   */
  async createTenant(input: CreateTenantInput): Promise<Tenant> {
    const tenantId = normalizeTenantIdentifier(input.id, 'id');
    const tenantSlug = normalizeTenantIdentifier(input.slug, 'slug');
    const schemaName = buildTenantSchemaName(tenantId);

    const tenant = await this.repository.createTenant({
      id: tenantId,
      name: input.name,
      slug: tenantSlug,
      schemaName
    });

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

    // Emit webhook event (non-blocking)
    emitWebhookEvent('tenant.created', {
      tenantId: tenantRecord.id,
      name: tenantRecord.name,
      slug: tenantRecord.slug,
      schemaName: tenantRecord.schema_name,
    }).catch(err => console.error('[TenantService] Webhook error:', err));

    return tenantRecord;
  }

  /**
   * Suspend tenant
   */
  async suspendTenant(tenantId: string): Promise<void> {
    const tenant = await this.repository.updateTenantStatus(tenantId, 'suspended');

    if (!tenant) {
      throw new TenantValidationError(`Tenant not found: ${tenantId}`);
    }

    clearTenantAuthCache(tenantId);
    await tenantManager.registerTenant({
      ...tenant,
      metadata: tenant.metadata || {}
    });

    console.log(`[TenantService] Tenant ${tenantId} suspended`);

    // Emit webhook event (non-blocking)
    emitWebhookEvent('tenant.suspended', {
      tenantId,
      name: tenant.name,
    }, tenantId).catch(err => console.error('[TenantService] Webhook error:', err));
  }

  /**
   * Activate tenant
   */
  async activateTenant(tenantId: string): Promise<void> {
    const tenant = await this.repository.updateTenantStatus(tenantId, 'active');

    if (!tenant) {
      throw new TenantValidationError(`Tenant not found: ${tenantId}`);
    }

    clearTenantAuthCache(tenantId);
    await tenantManager.registerTenant({
      ...tenant,
      metadata: tenant.metadata || {}
    });

    console.log(`[TenantService] Tenant ${tenantId} activated`);

    // Emit webhook event (non-blocking)
    emitWebhookEvent('tenant.activated', {
      tenantId,
      name: tenant.name,
    }, tenantId).catch(err => console.error('[TenantService] Webhook error:', err));
  }

  /**
   * Delete tenant (soft delete)
   */
  async deleteTenant(tenantId: string): Promise<void> {
    const tenant = await this.repository.updateTenantStatus(tenantId, 'deleted');

    if (!tenant) {
      throw new TenantValidationError(`Tenant not found: ${tenantId}`);
    }

    clearTenantAuthCache(tenantId);
    await tenantManager.registerTenant({
      ...tenant,
      metadata: tenant.metadata || {}
    });

    console.log(`[TenantService] Tenant ${tenantId} deleted (soft)`);

    // Emit webhook event (non-blocking)
    emitWebhookEvent('tenant.deleted', {
      tenantId,
      name: tenant.name,
    }, tenantId).catch(err => console.error('[TenantService] Webhook error:', err));
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
    const tenants = await this.repository.getTenantStatusSnapshot();

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
      readOnlyMode: false,
      ipBlocklist: [],
      rateLimitOverrides: {},
      enableIpBlocking: true,
      enableRateLimitLogging: true,
      blockOnRateLimitExceeded: false,
      rateLimitBlockDurationMs: 3600000,
    };
  }


  /**
   * Get security settings with defaults
   */
  async getSecuritySettings(): Promise<SecuritySettings> {
    await this.repository.ensureAdminSettingsTable();

    const stored = await this.repository.getSecuritySettings();

    if (!stored) {
      return this.getDefaultSecuritySettings();
    }

    const defaults = this.getDefaultSecuritySettings();

    const normalizeStringArray = (value: unknown, fallback: string[] = []) => Array.isArray(value)
      ? Array.from(new Set(value.map(item => String(item).trim()).filter(Boolean)))
      : fallback;

    return {
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
        : defaults.readOnlyMode,
      // New fields with defaults
      ipBlocklist: Array.isArray(stored.ipBlocklist) ? stored.ipBlocklist : [],
      rateLimitOverrides: stored.rateLimitOverrides || {},
      enableIpBlocking: typeof stored.enableIpBlocking === 'boolean'
        ? stored.enableIpBlocking
        : defaults.enableIpBlocking,
      enableRateLimitLogging: typeof stored.enableRateLimitLogging === 'boolean'
        ? stored.enableRateLimitLogging
        : defaults.enableRateLimitLogging,
      blockOnRateLimitExceeded: typeof stored.blockOnRateLimitExceeded === 'boolean'
        ? stored.blockOnRateLimitExceeded
        : defaults.blockOnRateLimitExceeded,
      rateLimitBlockDurationMs: typeof stored.rateLimitBlockDurationMs === 'number'
        ? stored.rateLimitBlockDurationMs
        : defaults.rateLimitBlockDurationMs,
    };
  }

  /**
   * Update security settings
   */
  async updateSecuritySettings(
    adminUserId: string,
    updates: UpdateSecuritySettingsInput
  ): Promise<SecuritySettings> {
    await this.repository.ensureAdminSettingsTable();

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
        : current.readOnlyMode,
      // New fields
      ipBlocklist: current.ipBlocklist,
      rateLimitOverrides: updates.rateLimitOverrides || current.rateLimitOverrides,
      enableIpBlocking: typeof updates.enableIpBlocking === 'boolean'
        ? updates.enableIpBlocking
        : current.enableIpBlocking,
      enableRateLimitLogging: typeof updates.enableRateLimitLogging === 'boolean'
        ? updates.enableRateLimitLogging
        : current.enableRateLimitLogging,
      blockOnRateLimitExceeded: typeof updates.blockOnRateLimitExceeded === 'boolean'
        ? updates.blockOnRateLimitExceeded
        : current.blockOnRateLimitExceeded,
      rateLimitBlockDurationMs: typeof updates.rateLimitBlockDurationMs === 'number'
        ? updates.rateLimitBlockDurationMs
        : current.rateLimitBlockDurationMs,
    };

    await this.repository.updateSecuritySettings(adminUserId, payload);

    return payload;
  }

  /**
   * Block an IP address
   */
  async blockIp(
    adminUserId: string,
    input: CreateIpBlockInput
  ): Promise<IpBlockEntry> {
    if (!isValidIpOrCidr(input.ip)) {
      throw new TenantValidationError(`Invalid IP address or CIDR: ${input.ip}`);
    }

    const settings = await this.getSecuritySettings();

    // Check if already blocked
    const existingIndex = settings.ipBlocklist.findIndex(e => e.ip === input.ip);
    if (existingIndex >= 0) {
      // Update existing block
      settings.ipBlocklist[existingIndex] = {
        ip: input.ip,
        reason: input.reason,
        blockedAt: new Date(),
        blockedBy: input.blockedBy,
        expiresAt: input.expiresInMs ? new Date(Date.now() + input.expiresInMs) : null,
        isCidr: input.ip.includes('/'),
      };
    } else {
      // Add new block
      settings.ipBlocklist.push({
        ip: input.ip,
        reason: input.reason,
        blockedAt: new Date(),
        blockedBy: input.blockedBy,
        expiresAt: input.expiresInMs ? new Date(Date.now() + input.expiresInMs) : null,
        isCidr: input.ip.includes('/'),
      });
    }

    await this.repository.updateSecuritySettings(adminUserId, settings);

    await this.logAuditAction(
      adminUserId,
      'block_ip',
      'security',
      input.ip,
      { reason: input.reason, expiresInMs: input.expiresInMs }
    );

    return settings.ipBlocklist.find(e => e.ip === input.ip)!;
  }

  /**
   * Unblock an IP address
   */
  async unblockIp(
    adminUserId: string,
    ip: string
  ): Promise<boolean> {
    const settings = await this.getSecuritySettings();
    const index = settings.ipBlocklist.findIndex(e => e.ip === ip);

    if (index < 0) {
      return false;
    }

    settings.ipBlocklist.splice(index, 1);
    await this.repository.updateSecuritySettings(adminUserId, settings);

    await this.logAuditAction(
      adminUserId,
      'unblock_ip',
      'security',
      ip,
      {}
    );

    return true;
  }

  /**
   * Get IP blocklist
   */
  async getIpBlocklist(): Promise<IpBlockEntry[]> {
    const settings = await this.getSecuritySettings();
    const now = new Date();

    // Filter out expired entries
    return settings.ipBlocklist.filter(entry => {
      if (entry.expiresAt && entry.expiresAt < now) {
        return false;
      }
      return true;
    });
  }

  /**
   * Check if IP is blocked (IPv4 and IPv6 support)
   */
  async isIpBlocked(ip: string): Promise<{ blocked: boolean; entry?: IpBlockEntry }> {
    const settings = await this.getSecuritySettings();

    if (!settings.enableIpBlocking) {
      return { blocked: false };
    }

    // Convert IPv4-mapped IPv6 to IPv4 if needed
    const normalizedIp = convertIpv4Mapped(ip);
    
    // Use the proper IP matching utility
    const result = isIpInBlocklist(normalizedIp, settings.ipBlocklist);
    
    return {
      blocked: result.blocked,
      entry: result.matchedEntry as IpBlockEntry | undefined
    };
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
    await this.repository.logAuditAction(adminUserId, action, targetType, targetId, details, ipAddress);
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
    return this.repository.getAuditLogs(limit, offset, filters);
  }

  getConnectionStats() {
    return tenantManager.getStats();
  }
}

export type { AuditLogEntry, CreateTenantInput, SecuritySettings, Tenant };
export { TenantValidationError };

export const tenantService = new TenantService(new PgTenantRepository());
