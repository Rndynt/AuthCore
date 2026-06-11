import { getTenantAuth } from '../../../src/multi-tenant/auth-factory.js';
import type { TenantAuthProvider } from '../../core/src/ports/tenant-auth-provider';

/**
 * BetterAuthTenantProvider
 *
 * Adapter that implements TenantAuthProvider by delegating to the
 * Better Auth per-tenant auth factory. Each tenant gets its own Better Auth
 * instance scoped to its isolated schema.
 */
export class BetterAuthTenantProvider implements TenantAuthProvider {
  async getTenantAuth(tenantId: string): Promise<{ handler(request: Request): Promise<Response>; api?: unknown }> {
    return getTenantAuth(tenantId);
  }
}

export const betterAuthTenantProvider = new BetterAuthTenantProvider();
