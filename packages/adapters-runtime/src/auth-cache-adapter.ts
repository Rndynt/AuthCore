import { clearTenantAuthCache, getAuthStats } from '../../../src/multi-tenant/auth-factory.js';
import type { AuthCache } from '../../core/src/ports/auth-cache';

/**
 * BetterAuthCacheAdapter
 *
 * Implements the AuthCache port by delegating to the Better Auth
 * per-tenant instance cache in the auth-factory module.
 */
export class BetterAuthCacheAdapter implements AuthCache {
  clearTenant(tenantId: string): void {
    clearTenantAuthCache(tenantId);
  }

  clearAll(): void {
    clearTenantAuthCache();
  }

  getStats(): unknown {
    return getAuthStats();
  }
}

export const authCacheAdapter = new BetterAuthCacheAdapter();
