/**
 * AppContainer — composition root for the Realmio auth service.
 *
 * Instantiates concrete adapters from the packages/* layer and wires
 * them into use cases from packages/core. Nothing in this file is allowed
 * to reach into src/ business logic directly — all src/ functionality must
 * be accessed through the packages/adapters-* wrappers.
 */

import type { AppConfig } from './config.js';

// ---------- Postgres adapters ----------
import { PgTenantRepository } from '../../../packages/adapters-postgres/src/pg-tenant-repository.js';
import { PgTenantSchemaProvisioner } from '../../../packages/adapters-postgres/src/pg-tenant-schema-provisioner.js';
import { PgAuditLogRepository } from '../../../packages/adapters-postgres/src/pg-audit-log-repository.js';
import { PgSecuritySettingsRepository } from '../../../packages/adapters-postgres/src/pg-security-settings-repository.js';
import { createPgPool } from '../../../packages/adapters-postgres/src/pg-pool.js';

// ---------- Better Auth adapters ----------
import { betterAuthAdminProvider } from '../../../packages/adapters-better-auth/src/better-auth-admin-provider.js';
import { betterAuthTenantProvider } from '../../../packages/adapters-better-auth/src/better-auth-tenant-provider.js';

// ---------- Runtime adapters ----------
import { tenantRegistryAdapter } from '../../../packages/adapters-runtime/src/tenant-registry-adapter.js';
import { tenantConnectionManagerAdapter } from '../../../packages/adapters-runtime/src/tenant-connection-manager.js';
import { authCacheAdapter } from '../../../packages/adapters-runtime/src/auth-cache-adapter.js';
import { logStreamAdapter } from '../../../packages/adapters-runtime/src/log-stream-adapter.js';
import { metricsStoreAdapter } from '../../../packages/adapters-runtime/src/metrics-store-adapter.js';
import { webhookEventPublisher, webhookRegistry } from '../../../packages/adapters-runtime/src/webhook-event-publisher.js';

// ---------- Core use cases ----------
import { ListTenantsUseCase, GetTenantUseCase, CreateTenantUseCase, SuspendTenantUseCase, ActivateTenantUseCase, DeleteTenantUseCase } from '../../../packages/core/src/application/tenant/tenant-use-cases.js';
import { GetTenantMetricsUseCase, GetSystemMetricsUseCase, GetAdminOverviewUseCase, GetDashboardMetricsUseCase, GetTimeSeriesUseCase } from '../../../packages/core/src/application/metrics/metrics-use-cases.js';
import { GetSecuritySettingsUseCase, UpdateSecuritySettingsUseCase, GetIpBlocklistUseCase, BlockIpUseCase, UnblockIpUseCase, CheckIpBlockedUseCase } from '../../../packages/core/src/application/security/security-use-cases.js';
import { LogAuditActionUseCase, GetAuditLogsUseCase } from '../../../packages/core/src/application/audit/audit-use-cases.js';
import { SearchUsersAcrossTenantsUseCase, RevokeUserSessionsUseCase, CreateSupportSessionUseCase, ListActiveSupportSessionsUseCase, RevokeSupportSessionUseCase, PruneIdleConnectionsUseCase } from '../../../packages/core/src/application/support-session/support-session-use-cases.js';
import { RegisterWebhookUseCase, UnregisterWebhookUseCase, GetWebhooksUseCase } from '../../../packages/core/src/application/webhook/webhook-use-cases.js';

// ---------- HTTP handler factory ----------
import { createAdminHandler } from '../../../packages/http/src/admin-api-handler.js';
import { TenantAuthHandler } from '../../../packages/http/src/tenant-auth-handler.js';
import { HealthHandler } from '../../../packages/http/src/health-handler.js';

// ---------- IP utilities (from src/utils — no business logic, just helpers) ----------
import { isValidIpOrCidr, isIpInBlocklist, convertIpv4Mapped } from '../../../src/utils/ip-utils.js';

// ---------------------------------------------------------------------------
// Container shape
// ---------------------------------------------------------------------------

export interface AppContainer {
  config: AppConfig;

  useCases: {
    tenants: {
      list: ListTenantsUseCase;
      get: GetTenantUseCase;
      create: CreateTenantUseCase;
      suspend: SuspendTenantUseCase;
      activate: ActivateTenantUseCase;
      delete: DeleteTenantUseCase;
      metrics: GetTenantMetricsUseCase;
    };
    security: {
      getSettings: GetSecuritySettingsUseCase;
      updateSettings: UpdateSecuritySettingsUseCase;
      getIpBlocklist: GetIpBlocklistUseCase;
      blockIp: BlockIpUseCase;
      unblockIp: UnblockIpUseCase;
      checkIpBlocked: CheckIpBlockedUseCase;
    };
    audit: {
      list: GetAuditLogsUseCase;
      log: LogAuditActionUseCase;
    };
    metrics: {
      system: GetSystemMetricsUseCase;
      overview: GetAdminOverviewUseCase;
      dashboard: GetDashboardMetricsUseCase;
      timeSeries: GetTimeSeriesUseCase;
    };
    supportSessions: {
      list: ListActiveSupportSessionsUseCase;
      create: CreateSupportSessionUseCase;
      revoke: RevokeSupportSessionUseCase;
      search: SearchUsersAcrossTenantsUseCase;
      revokeSessions: RevokeUserSessionsUseCase;
      pruneConnections: PruneIdleConnectionsUseCase;
    };
    connections: { prune: PruneIdleConnectionsUseCase };
    webhooks: {
      list: GetWebhooksUseCase;
      register: RegisterWebhookUseCase;
      unregister: UnregisterWebhookUseCase;
    };
  };

  httpHandlers: {
    adminApi: ReturnType<typeof createAdminHandler>;
    tenantAuth: TenantAuthHandler;
    health: HealthHandler;
  };

  authProviders: {
    admin: typeof betterAuthAdminProvider;
    tenant: typeof betterAuthTenantProvider;
  };

  tenantRegistry: typeof tenantRegistryAdapter;
  connectionManager: typeof tenantConnectionManagerAdapter;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export async function createAppContainer(config: AppConfig): Promise<AppContainer> {
  // ---- Shared infrastructure ----
  const pool = createPgPool();
  const tenantRepository = new PgTenantRepository(pool);
  const schemaProvisioner = new PgTenantSchemaProvisioner(pool as any);
  const auditRepository = new PgAuditLogRepository(pool);
  const securityRepository = new PgSecuritySettingsRepository(pool);

  const registry = tenantRegistryAdapter;
  const connectionManager = tenantConnectionManagerAdapter;
  const authCache = authCacheAdapter;
  const eventPublisher = webhookEventPublisher;

  // ---- Security defaults from config ----
  const securityDefaults = {
    trustedOrigins: config.trustedOrigins,
    enableDevEndpoints: config.devEnabled,
  };

  // ---- IP utilities (injected so core doesn't import ipaddr.js) ----
  const ipUtils = { isValidIpOrCidr, isIpInBlocklist, convertIpv4Mapped };

  // ---- Tenant lifecycle use cases ----
  const tenantDeps = { tenantRepository, tenantSchemaProvisioner: schemaProvisioner, tenantRegistry: registry, authCache, eventPublisher };
  const listTenants = new ListTenantsUseCase({ tenantRepository });
  const getTenant = new GetTenantUseCase({ tenantRepository });
  const createTenant = new CreateTenantUseCase(tenantDeps);
  const suspendTenant = new SuspendTenantUseCase(tenantDeps);
  const activateTenant = new ActivateTenantUseCase(tenantDeps);
  const deleteTenant = new DeleteTenantUseCase(tenantDeps);
  const getTenantMetrics = new GetTenantMetricsUseCase({ tenantClientProvider: connectionManager });

  // ---- Metrics use cases ----
  const metricsDeps = { tenantRepository, tenantRegistry: registry as any, tenantClientProvider: connectionManager, authCache };
  const getSystemMetrics = new GetSystemMetricsUseCase(metricsDeps);
  const getAdminOverview = new GetAdminOverviewUseCase(metricsDeps);
  const getDashboardMetrics = new GetDashboardMetricsUseCase({ metricsStore: metricsStoreAdapter });
  const getTimeSeries = new GetTimeSeriesUseCase({ metricsStore: metricsStoreAdapter });

  // ---- Security use cases ----
  const securityDeps = { securityRepository, auditLogRepository: auditRepository, defaults: securityDefaults, ipUtils };
  const getSecuritySettings = new GetSecuritySettingsUseCase(securityDeps);
  const updateSecuritySettings = new UpdateSecuritySettingsUseCase(securityDeps);
  const getIpBlocklist = new GetIpBlocklistUseCase(securityDeps);
  const blockIp = new BlockIpUseCase(securityDeps);
  const unblockIp = new UnblockIpUseCase(securityDeps);
  const checkIpBlocked = new CheckIpBlockedUseCase(securityDeps);

  // ---- Audit use cases ----
  const logAuditAction = new LogAuditActionUseCase({ auditLogRepository: auditRepository });
  const getAuditLogs = new GetAuditLogsUseCase({ auditLogRepository: auditRepository });

  // ---- Support session / user use cases ----
  const sessionDeps = { tenantRegistry: registry, tenantClientProvider: connectionManager };
  const searchUsers = new SearchUsersAcrossTenantsUseCase(sessionDeps);
  const revokeSessions = new RevokeUserSessionsUseCase(sessionDeps);
  const createSupportSession = new CreateSupportSessionUseCase(sessionDeps);
  const listSupportSessions = new ListActiveSupportSessionsUseCase(sessionDeps);
  const revokeSupportSession = new RevokeSupportSessionUseCase(sessionDeps);
  const pruneConnections = new PruneIdleConnectionsUseCase({ connectionPruner: connectionManager });

  // ---- Webhook use cases ----
  const getWebhooks = new GetWebhooksUseCase({ registry: webhookRegistry as any });
  const registerWebhook = new RegisterWebhookUseCase({ registry: webhookRegistry as any });
  const unregisterWebhook = new UnregisterWebhookUseCase({ registry: webhookRegistry as any });

  // ---- Use-case facade for HTTP handler ----
  const useCasesFacade = {
    tenants: {
      list: () => listTenants.execute(),
      get: (id: string) => getTenant.execute(id),
      create: (input: any) => createTenant.execute(input),
      suspend: (id: string) => suspendTenant.execute(id),
      activate: (id: string) => activateTenant.execute(id),
      delete: (id: string) => deleteTenant.execute(id),
      metrics: (id: string) => getTenantMetrics.execute(id),
    },
    security: {
      getSettings: () => getSecuritySettings.execute(),
      updateSettings: (adminUserId: string, updates: any) => updateSecuritySettings.execute(adminUserId, updates),
      getIpBlocklist: () => getIpBlocklist.execute(),
      blockIp: (adminUserId: string, input: any) => blockIp.execute(adminUserId, input),
      unblockIp: (adminUserId: string, ip: string) => unblockIp.execute(adminUserId, ip),
      checkIpBlocked: (ip: string) => checkIpBlocked.execute(ip),
    },
    audit: {
      list: (limit: number, offset: number, filters: any) => getAuditLogs.execute(limit, offset, filters),
      log: (adminUserId: string, action: string, targetType: string, targetId: string, details: any, ip?: string) =>
        logAuditAction.execute(adminUserId, action, targetType, targetId, details, ip),
    },
    metrics: {
      system: () => getSystemMetrics.execute(),
      overview: () => getAdminOverview.execute(),
      dashboard: () => getDashboardMetrics.execute(),
      timeSeries: () => getTimeSeries.execute(),
    },
    supportSessions: {
      list: () => listSupportSessions.execute(),
      create: (tenantId: string, userId: string, minutes?: number) => createSupportSession.execute(tenantId, userId, minutes),
      revoke: (tenantId: string, sessionId: string) => revokeSupportSession.execute(tenantId, sessionId),
      search: (opts: any) => searchUsers.execute(opts),
      revokeSessions: (tenantId: string, userId: string) => revokeSessions.execute(tenantId, userId),
    },
    connections: {
      prune: (force?: boolean) => pruneConnections.execute(force),
    },
    webhooks: {
      list: () => getWebhooks.execute(),
      register: (input: any) => registerWebhook.execute(input),
      unregister: (id: string) => unregisterWebhook.execute(id),
    },
  };

  // ---- HTTP handlers ----
  const adminApiHandlers = createAdminHandler({
    adminAuth: betterAuthAdminProvider,
    useCases: useCasesFacade as any,
    logStream: logStreamAdapter,
  });

  const tenantAuthHandler = new TenantAuthHandler({
    tenantRegistry: registry,
    tenantAuthProvider: betterAuthTenantProvider,
  });

  const healthHandler = new HealthHandler({
    mode: config.authConfig.mode,
    features: config.featureFlags,
    connectionHealth: () => connectionManager.getHealthStatus(),
  });

  return {
    config,
    useCases: {
      tenants: { list: listTenants, get: getTenant, create: createTenant, suspend: suspendTenant, activate: activateTenant, delete: deleteTenant, metrics: getTenantMetrics },
      security: { getSettings: getSecuritySettings, updateSettings: updateSecuritySettings, getIpBlocklist, blockIp, unblockIp, checkIpBlocked },
      audit: { list: getAuditLogs, log: logAuditAction },
      metrics: { system: getSystemMetrics, overview: getAdminOverview, dashboard: getDashboardMetrics, timeSeries: getTimeSeries },
      supportSessions: { list: listSupportSessions, create: createSupportSession, revoke: revokeSupportSession, search: searchUsers, revokeSessions, pruneConnections },
      connections: { prune: pruneConnections },
      webhooks: { list: getWebhooks, register: registerWebhook, unregister: unregisterWebhook },
    },
    httpHandlers: {
      adminApi: adminApiHandlers,
      tenantAuth: tenantAuthHandler,
      health: healthHandler,
    },
    authProviders: {
      admin: betterAuthAdminProvider,
      tenant: betterAuthTenantProvider,
    },
    tenantRegistry: registry,
    connectionManager,
  };
}
