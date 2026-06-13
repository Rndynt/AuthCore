import { getTenantAuth } from './tenant-auth-factory.js';
import type { TenantAuthProvider } from '../../core/src/ports/tenant-auth-provider';

export class BetterAuthTenantProvider implements TenantAuthProvider {
  async getTenantAuth(tenantId: string): Promise<{ handler(request: Request): Promise<Response>; api?: unknown }> {
    return getTenantAuth(tenantId);
  }
}

export const betterAuthTenantProvider = new BetterAuthTenantProvider();
