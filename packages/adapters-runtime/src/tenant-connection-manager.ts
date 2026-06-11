import { tenantManager } from '../../../src/multi-tenant/connection-manager.js';
import type { TenantClientProvider } from '../../core/src/ports/tenant-client-provider';

/**
 * TenantConnectionManagerAdapter
 *
 * Implements TenantClientProvider by delegating to the underlying
 * TenantConnectionManager singleton, which maintains per-tenant Prisma clients.
 */
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

  getHealthStatus(): unknown {
    return tenantManager.getHealthStatus();
  }

  getStats(): unknown {
    return tenantManager.getStats();
  }
}

export const tenantConnectionManagerAdapter = new TenantConnectionManagerAdapter();

// Re-export class for DI scenarios
export { TenantConnectionManagerAdapter as TenantConnectionManager };
