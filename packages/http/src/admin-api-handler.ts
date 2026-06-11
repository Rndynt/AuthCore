/**
 * AdminApiHandler
 *
 * Real HTTP handler for all /admin/api/* and /admin/log-stream routes.
 * Accepts use cases from the AppContainer and dispatches to them.
 * Does NOT import any legacy src/ modules.
 */

import { jsonResponse } from './http-response';
import type { AdminAuthProvider } from '../../core/src/ports/admin-auth-provider';
import type { Tenant } from '../../core/src/domain/tenant/tenant';
import type { IpBlockEntry, CreateIpBlockInput } from '../../core/src/domain/security/security-settings';
import type { AuditLogEntry } from '../../core/src/domain/audit/audit-log';

const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// Use-case shape expected by this handler (matches container.useCases)
// ---------------------------------------------------------------------------

export interface AdminHandlerUseCases {
  tenants: {
    list(): Promise<Tenant[]>;
    get(id: string): Promise<Tenant | null>;
    create(input: { id: string; name: string; slug: string }): Promise<Tenant>;
    suspend(id: string): Promise<void>;
    activate(id: string): Promise<void>;
    delete(id: string): Promise<void>;
    metrics(id: string): Promise<unknown>;
  };
  security: {
    getSettings(): Promise<unknown>;
    updateSettings(adminUserId: string, updates: unknown): Promise<unknown>;
    getIpBlocklist(): Promise<IpBlockEntry[]>;
    blockIp(adminUserId: string, input: CreateIpBlockInput): Promise<IpBlockEntry>;
    unblockIp(adminUserId: string, ip: string): Promise<boolean>;
    checkIpBlocked(ip: string): Promise<{ blocked: boolean; entry?: IpBlockEntry }>;
  };
  audit: {
    list(limit: number, offset: number, filters: Record<string, unknown>): Promise<{ logs: AuditLogEntry[]; total: number }>;
    log(adminUserId: string, action: string, targetType: string, targetId: string, details: Record<string, unknown>, ip?: string): Promise<void>;
  };
  metrics: {
    system(): Promise<unknown>;
    overview(): Promise<unknown>;
    dashboard(): Promise<unknown>;
    timeSeries(): Promise<unknown>;
  };
  supportSessions: {
    list(): Promise<unknown[]>;
    create(tenantId: string, userId: string, minutes?: number): Promise<{ token: string; expiresAt: Date }>;
    revoke(tenantId: string, sessionId: string): Promise<boolean>;
    search(opts: { query?: string; tenantId?: string; limit?: number }): Promise<unknown[]>;
    revokeSessions(tenantId: string, userId: string): Promise<number>;
  };
  connections: {
    prune(force?: boolean): Promise<{ pruned: number }>;
  };
  webhooks: {
    list(): unknown;
    register(input: unknown): unknown;
    unregister(id: string): boolean;
  };
}

export interface AdminHandlerDeps {
  adminAuth: AdminAuthProvider;
  useCases: AdminHandlerUseCases;
  logStream: {
    addListener(listener: (event: unknown) => void): void;
    removeListener(listener: (event: unknown) => void): void;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeTenant(tenant: Tenant) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    schemaName: tenant.schemaName,
    metadata: tenant.metadata ?? {},
    createdAt: tenant.createdAt instanceof Date ? tenant.createdAt.toISOString() : tenant.createdAt,
    updatedAt: tenant.updatedAt instanceof Date ? tenant.updatedAt.toISOString() : tenant.updatedAt,
  };
}

async function parseJsonBody(request: Request): Promise<any> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const raw = await request.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw jsonResponse({ error: 'INVALID_JSON', message: 'Request body must be valid JSON' }, { status: 400 });
  }
}

async function getAdminSession(adminAuth: AdminAuthProvider, headers: Headers) {
  const session = await adminAuth.api.getSession({ headers }).catch(() => null);
  if (!session?.user) {
    throw jsonResponse({ error: 'UNAUTHORIZED', message: 'Admin authentication required.' }, { status: 401 });
  }
  return session;
}

// ---------------------------------------------------------------------------
// Main handler factory
// ---------------------------------------------------------------------------

export function createAdminHandler(deps: AdminHandlerDeps) {
  const { adminAuth, useCases, logStream } = deps;

  async function handleAdminApiRequest(
    request: Request,
    context: { ip?: string } = {},
  ): Promise<Response | null> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/admin/api')) return null;

    const session = await getAdminSession(adminAuth, new Headers(request.headers)).catch(err => {
      if (err instanceof Response) return Promise.reject(err);
      return null;
    });
    if (session instanceof Response) return session;
    if (!session) return jsonResponse({ error: 'UNAUTHORIZED', message: 'Admin authentication required.' }, { status: 401 });

    const adminUser = (session as any).user;
    const ip = context.ip;
    const segments = url.pathname.split('/').filter(Boolean);
    const resource = segments.slice(2); // strip 'admin', 'api'
    const method = request.method.toUpperCase();

    const audit = (action: string, targetType: string, targetId: string, details: Record<string, unknown> = {}) =>
      useCases.audit.log(adminUser.id, action, targetType, targetId, details, ip).catch(() => undefined);

    try {
      if (!resource[0]) return jsonResponse({ error: 'Not Found' }, { status: 404 });

      switch (resource[0]) {
        case 'me': {
          if (method !== 'GET') break;
          return jsonResponse({ user: adminUser, session: (session as any).session });
        }

        case 'tenants': {
          if (resource.length === 1) {
            if (method === 'GET') {
              const tenants = await useCases.tenants.list();
              await audit('list_tenants', 'system', 'all', { count: tenants.length });
              return jsonResponse({ tenants: tenants.map(serializeTenant) });
            }
            if (method === 'POST') {
              const body = await parseJsonBody(request);
              const tenant = await useCases.tenants.create(body ?? {});
              await audit('create_tenant', 'tenant', tenant.id, body ?? {});
              return jsonResponse({ tenant: serializeTenant(tenant) });
            }
            break;
          }

          const tenantId = resource[1];
          if (!tenantId) return jsonResponse({ error: 'Tenant not found' }, { status: 404 });

          if (resource.length === 2) {
            if (method === 'GET') {
              const tenant = await useCases.tenants.get(tenantId);
              if (!tenant) return jsonResponse({ error: 'Tenant not found' }, { status: 404 });
              return jsonResponse({ tenant: serializeTenant(tenant) });
            }
            if (method === 'DELETE') {
              await useCases.tenants.delete(tenantId);
              await audit('delete_tenant', 'tenant', tenantId);
              return jsonResponse({ message: 'Tenant deleted successfully' });
            }
            break;
          }

          if (resource.length === 3) {
            const action = resource[2];
            if (action === 'metrics' && method === 'GET') {
              const metrics = await useCases.tenants.metrics(tenantId);
              return jsonResponse({ metrics });
            }
            if (action === 'suspend' && method === 'POST') {
              await useCases.tenants.suspend(tenantId);
              await audit('suspend_tenant', 'tenant', tenantId);
              return jsonResponse({ message: 'Tenant suspended successfully' });
            }
            if (action === 'activate' && method === 'POST') {
              await useCases.tenants.activate(tenantId);
              await audit('activate_tenant', 'tenant', tenantId);
              return jsonResponse({ message: 'Tenant activated successfully' });
            }
            break;
          }

          if (resource.length >= 5 && resource[2] === 'users') {
            const userId = resource[3];
            const userAction = resource[4];
            if (!userId || !userAction) break;
            if (userAction === 'revoke-sessions' && method === 'POST') {
              await useCases.supportSessions.revokeSessions(tenantId, userId);
              await audit('revoke_user_sessions', 'user', `${tenantId}:${userId}`);
              return jsonResponse({ message: 'User sessions revoked' });
            }
            if (userAction === 'support-session' && method === 'POST') {
              const body = await parseJsonBody(request);
              const sessionResult = await useCases.supportSessions.create(tenantId, userId, body?.minutes);
              await audit('create_support_session', 'user', `${tenantId}:${userId}`, { minutes: body?.minutes });
              return jsonResponse({ session: sessionResult });
            }
          }
          break;
        }

        case 'metrics': {
          if (resource.length === 1 && method === 'GET') {
            return jsonResponse({ metrics: await useCases.metrics.system() });
          }
          break;
        }

        case 'overview': {
          if (resource.length === 1 && method === 'GET') {
            return jsonResponse({ overview: await useCases.metrics.overview() });
          }
          break;
        }

        case 'users': {
          if (resource[1] === 'search' && method === 'GET') {
            const q = url.searchParams.get('q') || undefined;
            const tId = url.searchParams.get('tenantId') || undefined;
            const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined;
            const results = await useCases.supportSessions.search({ query: q, tenantId: tId, limit });
            await audit('search_users', 'system', tId || 'all', { query: q, limit });
            return jsonResponse({ users: results });
          }
          break;
        }

        case 'security': {
          if (resource[1] === 'settings') {
            if (method === 'GET') {
              return jsonResponse({ settings: await useCases.security.getSettings() });
            }
            if (method === 'PUT') {
              const body = await parseJsonBody(request);
              const settings = await useCases.security.updateSettings(adminUser.id, body ?? {});
              await audit('update_security_settings', 'system', 'security', body ?? {});
              return jsonResponse({ settings });
            }
          }
          if (resource[1] === 'ip-blocklist') {
            if (method === 'GET') return jsonResponse({ blocklist: await useCases.security.getIpBlocklist() });
            if (method === 'POST' && resource.length === 2) {
              const body = await parseJsonBody(request);
              const entry = await useCases.security.blockIp(adminUser.id, {
                ip: body?.ip,
                reason: body?.reason || 'Blocked via admin',
                blockedBy: adminUser.id,
                expiresInMs: body?.expiresInMs,
              });
              return jsonResponse({ entry });
            }
            if (method === 'DELETE' && resource.length === 3) {
              const ipToUnblock = decodeURIComponent(resource[2]);
              const result = await useCases.security.unblockIp(adminUser.id, ipToUnblock);
              return jsonResponse({ success: result });
            }
          }
          if (resource[1] === 'ip-check' && resource.length === 3) {
            return jsonResponse(await useCases.security.checkIpBlocked(decodeURIComponent(resource[2])));
          }
          break;
        }

        case 'support-sessions': {
          if (resource.length === 1 && method === 'GET') {
            return jsonResponse({ sessions: await useCases.supportSessions.list() });
          }
          if (resource.length === 3 && method === 'DELETE') {
            const [, tId, sId] = resource;
            if (!tId || !sId) break;
            const revoked = await useCases.supportSessions.revoke(tId, sId);
            if (revoked) await audit('revoke_support_session', 'tenant', tId, { sessionId: sId });
            return jsonResponse({ revoked });
          }
          break;
        }

        case 'connections': {
          if (resource[1] === 'prune' && method === 'POST') {
            const body = await parseJsonBody(request);
            const force = Boolean(body?.force);
            const result = await useCases.connections.prune(force);
            await audit('prune_connections', 'system', 'connection_pool', { force, pruned: result.pruned });
            return jsonResponse(result);
          }
          break;
        }

        case 'audit-logs': {
          if (resource.length === 1 && method === 'GET') {
            const p = url.searchParams;
            const limit = Math.min(Math.max(parseInt(p.get('limit') ?? '50', 10), 1), 200);
            const offset = Math.max(parseInt(p.get('offset') ?? '0', 10), 0);
            const filters: Record<string, unknown> = {};
            for (const key of ['action', 'targetType', 'targetId', 'adminUserId', 'from', 'to', 'search', 'tenantStatus']) {
              const v = p.get(key); if (v) filters[key] = v;
            }
            return jsonResponse(await useCases.audit.list(limit, offset, filters));
          }
          break;
        }

        case 'dashboard-metrics': {
          if (resource.length === 1 && method === 'GET') {
            return jsonResponse({ metrics: await useCases.metrics.dashboard() });
          }
          break;
        }

        case 'time-series': {
          if (resource.length === 1 && method === 'GET') {
            return jsonResponse({ data: await useCases.metrics.timeSeries() });
          }
          break;
        }

        case 'webhooks': {
          if (resource.length === 1) {
            if (method === 'GET') return jsonResponse(useCases.webhooks.list());
            if (method === 'POST') {
              const body = await parseJsonBody(request);
              if (!body?.url || typeof body.url !== 'string')
                return jsonResponse({ error: 'VALIDATION_ERROR', message: 'url is required' }, { status: 400 });
              if (!body?.secret || body.secret.length < 16)
                return jsonResponse({ error: 'VALIDATION_ERROR', message: 'secret must be at least 16 characters' }, { status: 400 });
              const webhook = useCases.webhooks.register(body) as any;
              await audit('register_webhook', 'system', webhook.id, { url: body.url, events: body.events });
              return jsonResponse({ webhook: { ...webhook, secret: '[REDACTED]' } }, { status: 201 });
            }
          }
          if (resource.length === 2 && method === 'DELETE') {
            const deleted = useCases.webhooks.unregister(resource[1]);
            if (!deleted) return jsonResponse({ error: 'Webhook not found' }, { status: 404 });
            await audit('unregister_webhook', 'system', resource[1]);
            return jsonResponse({ message: 'Webhook unregistered' });
          }
          break;
        }
      }

      return jsonResponse({ error: 'Not Found' }, { status: 404 });
    } catch (err) {
      if (err instanceof Response) return err;
      console.error('[AdminApiHandler] Unexpected error:', err);
      return jsonResponse({ error: 'Internal server error' }, { status: 500 });
    }
  }

  async function handleAdminLogStream(
    request: Request,
    context: { ip?: string } = {},
  ): Promise<Response | null> {
    const url = new URL(request.url);
    if (url.pathname !== '/admin/log-stream') return null;
    if (request.method.toUpperCase() !== 'GET')
      return jsonResponse({ error: 'Method Not Allowed' }, { status: 405 });

    const session = await getAdminSession(adminAuth, new Headers(request.headers)).catch(err => {
      if (err instanceof Response) return err;
      return null;
    });
    if (session instanceof Response) return session;
    if (!session) return jsonResponse({ error: 'UNAUTHORIZED' }, { status: 401 });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch { /* ignore if stream is closed */ }
        };

        const listener = (event: unknown) => send('log', event);
        send('ready', { ok: true });
        logStream.addListener(listener);

        const keepAlive = setInterval(() => {
          controller.enqueue(encoder.encode(':keep-alive\n\n'));
        }, 15000);

        const cleanup = () => {
          clearInterval(keepAlive);
          logStream.removeListener(listener);
        };

        request.signal?.addEventListener('abort', () => { cleanup(); controller.close(); });

        (controller as any)._cleanup = cleanup;
      },
      cancel() {
        (this as any)._cleanup?.();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  return { handleAdminApiRequest, handleAdminLogStream };
}
