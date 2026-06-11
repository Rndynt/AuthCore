import { jsonResponse } from './http-response';
import { resolveTenant } from './tenant-resolver';
import type { TenantRegistry } from '../../core/src/ports/tenant-registry';
import type { TenantAuthProvider } from '../../core/src/ports/tenant-auth-provider';

export class TenantAuthHandler {
  constructor(private deps: { tenantRegistry: TenantRegistry; tenantAuthProvider: TenantAuthProvider }) {}

  async handle(request: Request, options: { pathTenantId?: string; stripTenantPrefix?: boolean } = {}) {
    const url = new URL(request.url);
    const resolved = resolveTenant({ headers: request.headers, pathname: url.pathname, host: request.headers.get('host') ?? undefined, pathTenantId: options.pathTenantId }, this.deps.tenantRegistry);
    if (!('tenant' in resolved) || !resolved.tenant) {
      return jsonResponse({ error: resolved.error, message: resolved.message, tenantId: resolved.tenantId }, { status: resolved.status });
    }
    if (options.stripTenantPrefix) url.pathname = url.pathname.replace(/^\/tenant\/[^/]+\/api\/auth/, '/api/auth');
    const tenantAuth = await this.deps.tenantAuthProvider.getTenantAuth(resolved.tenant.id);
    return tenantAuth.handler(new Request(url.toString(), request));
  }
}
