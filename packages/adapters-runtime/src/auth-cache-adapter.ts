import { clearTenantAuthCache, getAuthStats } from '../../adapters-better-auth/src/tenant-auth-factory.js';
import type { AuthCache } from '../../core/src/ports/auth-cache';

export class BetterAuthCacheAdapter implements AuthCache {
  clearTenant(tenantId: string): void { clearTenantAuthCache(tenantId); }
  clearAll(): void                    { clearTenantAuthCache(); }
  getStats(): unknown                 { return getAuthStats(); }
}

export const authCacheAdapter = new BetterAuthCacheAdapter();
