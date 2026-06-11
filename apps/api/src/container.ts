import { tenantService } from '../../../src/application/tenant-service.js';
import { tenantManager } from '../../../src/multi-tenant/connection-manager.js';
import { adminAuth } from '../../../src/admin/auth.js';
import { getTenantAuth, clearTenantAuthCache, getAuthStats } from '../../../src/multi-tenant/auth-factory.js';
import { addLogListener, removeLogListener } from '../../../src/utils/log-stream.js';
import { metricsStore } from '../../../src/utils/metrics-store.js';

export interface AppContainer {
  tenantService: typeof tenantService;
  tenantManager: typeof tenantManager;
  adminAuth: typeof adminAuth;
  tenantAuthProvider: { getTenantAuth: typeof getTenantAuth };
  authCache: { clearTenant(tenantId: string): void; clearAll(): void; getStats(): unknown };
  logStream: { addListener: typeof addLogListener; removeListener: typeof removeLogListener };
  metricsStore: Pick<typeof metricsStore, 'getMetrics' | 'getTimeSeriesData'>;
}

export function createAppContainer(): AppContainer {
  return {
    tenantService,
    tenantManager,
    adminAuth,
    tenantAuthProvider: { getTenantAuth },
    authCache: { clearTenant: clearTenantAuthCache, clearAll: () => clearTenantAuthCache(), getStats: getAuthStats },
    logStream: { addListener: addLogListener, removeListener: removeLogListener },
    metricsStore,
  };
}
