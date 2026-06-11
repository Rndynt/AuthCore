import { clearTenantAuthCache, getAuthStats } from '../../../src/multi-tenant/auth-factory.js';
export class BetterAuthCacheAdapter { clearTenant(tenantId: string) { clearTenantAuthCache(tenantId); } clearAll() { clearTenantAuthCache(); } getStats() { return getAuthStats(); } }
