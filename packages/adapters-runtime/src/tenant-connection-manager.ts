import { tenantManager } from './tenant-connection-manager-impl.js';
import type { TenantClientProvider } from '../../core/src/ports/tenant-client-provider';

export class TenantConnectionManagerAdapter implements TenantClientProvider {
  getClient(tenantId: string): any {
    return tenantManager.getClient(tenantId);
  }
  async pruneIdleConnectionsNow(options?: { force?: boolean }): Promise<number> {
    return tenantManager.pruneIdleConnectionsNow(options);
  }
  async shutdown(): Promise<void> {
    return tenantManager.shutdown();
  }
  getHealthStatus(): unknown { return tenantManager.getHealthStatus(); }
  getStats(): unknown      { return tenantManager.getStats(); }
}

export const tenantConnectionManagerAdapter = new TenantConnectionManagerAdapter();
export { TenantConnectionManagerAdapter as TenantConnectionManager };
