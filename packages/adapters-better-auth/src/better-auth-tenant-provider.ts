import { getTenantAuth } from '../../../src/multi-tenant/auth-factory.js';
export class BetterAuthTenantProvider { getTenantAuth(tenantId: string) { return getTenantAuth(tenantId); } }
