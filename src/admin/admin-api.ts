import { TenantValidationError } from "../domain/tenant/errors.js";
import type { Tenant } from "../domain/tenant/tenant.js";
import type { SecuritySettings } from "../domain/tenant/security-settings.js";
import type { LogEvent } from "../utils/log-stream.js";

const encoder = new TextEncoder();

interface AdminSession {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string | null;
  };
  session: any;
}

export interface AdminApiContext {
  ip?: string;
}

export interface AdminAuthApi {
  api: {
    getSession: (input: { headers: Headers }) => Promise<AdminSession | null>;
  };
}

export interface AdminApiTenantService {
  listTenants(): Promise<Tenant[]>;
  createTenant(input: unknown): Promise<Tenant>;
  getTenant(id: string): Promise<Tenant | null>;
  deleteTenant(id: string): Promise<void>;
  getTenantMetrics(id: string): Promise<unknown>;
  suspendTenant(id: string): Promise<void>;
  activateTenant(id: string): Promise<void>;
  revokeUserSessions(tenantId: string, userId: string): Promise<void>;
  createSupportSession(tenantId: string, userId: string, minutes?: number): Promise<string>;
  searchUsersAcrossTenants(options: {
    query?: string;
    tenantId?: string;
    limit?: number;
  }): Promise<unknown[]>;
  getSecuritySettings(): Promise<SecuritySettings>;
  updateSecuritySettings(
    adminUserId: string,
    settings: Partial<SecuritySettings>
  ): Promise<SecuritySettings>;
  listActiveSupportSessions(): Promise<unknown[]>;
  revokeSupportSession(tenantId: string, sessionId: string): Promise<boolean>;
  pruneIdleConnections(force: boolean): Promise<{ pruned: number }>;
  getAuditLogs(
    limit: number,
    offset: number,
    filters: Record<string, unknown>
  ): Promise<unknown>;
  getSystemMetrics(): Promise<unknown>;
  getAdminOverview(): Promise<unknown>;
  logAuditAction(
    adminUserId: string,
    action: string,
    targetType: string,
    targetId: string,
    details: unknown,
    ipAddress?: string
  ): Promise<void>;
}

export interface AdminApiDependencies {
  adminAuth: AdminAuthApi;
  tenantService: AdminApiTenantService;
  tenantManager: {
    initialize: () => Promise<void>;
  };
  addLogListener: (listener: (event: LogEvent) => void) => void;
  removeLogListener: (listener: (event: LogEvent) => void) => void;
}

const JSON_HEADERS = {
  "Content-Type": "application/json"
};

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const body = JSON.stringify(data);
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(JSON_HEADERS)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }

  return new Response(body, {
    ...init,
    headers
  });
}

function serializeTenant(tenant: Tenant) {
  const createdAt = tenant.created_at instanceof Date
    ? tenant.created_at.toISOString()
    : tenant.created_at;
  const updatedAt = tenant.updated_at instanceof Date
    ? tenant.updated_at.toISOString()
    : tenant.updated_at;

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    schemaName: tenant.schema_name,
    metadata: tenant.metadata ?? {},
    createdAt,
    updatedAt
  };
}

function getClientIp(context?: AdminApiContext): string | undefined {
  return context?.ip;
}

export function createAdminApiHandlers(deps: AdminApiDependencies) {
  let tenantManagerReady = false;
  let tenantManagerInitPromise: Promise<void> | null = null;

  async function ensureTenantManagerInitialized() {
    if (tenantManagerReady) {
      return;
    }

    if (!tenantManagerInitPromise) {
      tenantManagerInitPromise = deps.tenantManager.initialize().then(() => {
        tenantManagerReady = true;
      }).catch((error) => {
        tenantManagerInitPromise = null;
        throw error;
      });
    }

    await tenantManagerInitPromise;
  }

  async function ensureAdminSession(headers: Headers): Promise<AdminSession> {
    try {
      const session = await deps.adminAuth.api.getSession({ headers });
      if (!session || !session.user) {
        throw new Error("UNAUTHORIZED");
      }
      return session;
    } catch (error) {
      // Don't log expected UNAUTHORIZED errors
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        throw jsonResponse({
          error: "UNAUTHORIZED",
          message: "Admin authentication required. Please login."
        }, { status: 401 });
      }
      console.error("[Admin API] Session validation error:", error);
      throw jsonResponse({
        error: "UNAUTHORIZED",
        message: "Admin authentication required. Please login."
      }, { status: 401 });
    }
  }

  async function parseJsonBody(request: Request): Promise<any> {
    if (request.method === "GET" || request.method === "HEAD") {
      return undefined;
    }

    const contentType = request.headers.get("content-type") || "";
    const raw = await request.text();
    if (!raw) {
      return contentType.includes("json") ? {} : undefined;
    }

    try {
      return JSON.parse(raw);
    } catch {
      throw jsonResponse({
        error: "INVALID_JSON",
        message: "Request body must be valid JSON"
      }, { status: 400 });
    }
  }

  function handleTenantValidation(error: unknown, action: string): Response | null {
    if (error instanceof TenantValidationError) {
      return jsonResponse({
        error: "VALIDATION_ERROR",
        message: error.message
      }, { status: 400 });
    }

    console.error(`[Admin API] ${action} error:`, error);
    return null;
  }

  async function handleAdminApiRequest(
    request: Request,
    context: AdminApiContext = {}
  ): Promise<Response | null> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/admin/api")) {
      return null;
    }

    try {
      await ensureTenantManagerInitialized();
    } catch (error) {
      console.error("[Admin API] Failed to initialize tenant manager:", error);
      return jsonResponse({ error: "Failed to initialize tenant manager" }, { status: 500 });
    }

    const headers = new Headers(request.headers);
    const session = await ensureAdminSession(headers);
    const adminUser = session.user;
    const ip = getClientIp(context);
    const segments = url.pathname.split("/").filter(Boolean);
    const resource = segments.slice(2); // drop "admin", "api"
    const method = request.method.toUpperCase();

    try {
      if (resource.length === 0) {
        return jsonResponse({ error: "Not Found" }, { status: 404 });
      }

      switch (resource[0]) {
        case "me": {
          if (method !== "GET") break;
          return jsonResponse({ user: adminUser, session: session.session });
        }

        case "tenants": {
          if (resource.length === 1) {
            if (method === "GET") {
              const tenants = await deps.tenantService.listTenants();
              await deps.tenantService.logAuditAction(
                adminUser.id,
                "list_tenants",
                "system",
                "all",
                { count: tenants.length },
                ip
              );
              return jsonResponse({ tenants: tenants.map(serializeTenant) });
            }

            if (method === "POST") {
              const body = await parseJsonBody(request);
              try {
                const tenant = await deps.tenantService.createTenant(body ?? {});
                await deps.tenantService.logAuditAction(
                  adminUser.id,
                  "create_tenant",
                  "tenant",
                  tenant.id,
                  body ?? {},
                  ip
                );
                return jsonResponse({ tenant: serializeTenant(tenant) });
              } catch (error) {
                const handled = handleTenantValidation(error, "Create tenant");
                if (handled) return handled;
                throw error;
              }
            }

            break;
          }

          const tenantId = resource[1];
          if (!tenantId) {
            return jsonResponse({ error: "Tenant not found" }, { status: 404 });
          }

          if (resource.length === 2) {
            if (method === "GET") {
              const tenant = await deps.tenantService.getTenant(tenantId);
              if (!tenant) {
                return jsonResponse({ error: "Tenant not found" }, { status: 404 });
              }
              return jsonResponse({ tenant: serializeTenant(tenant) });
            }

            if (method === "DELETE") {
              try {
                await deps.tenantService.deleteTenant(tenantId);
                await deps.tenantService.logAuditAction(
                  adminUser.id,
                  "delete_tenant",
                  "tenant",
                  tenantId,
                  {},
                  ip
                );
                return jsonResponse({ message: "Tenant deleted successfully" });
              } catch (error) {
                const handled = handleTenantValidation(error, "Delete tenant");
                if (handled) return handled;
                throw error;
              }
            }

            break;
          }

          if (resource.length === 3) {
            const action = resource[2];

            if (action === "metrics" && method === "GET") {
              const metrics = await deps.tenantService.getTenantMetrics(tenantId);
              return jsonResponse({ metrics });
            }

            if (action === "suspend" && method === "POST") {
              try {
                await deps.tenantService.suspendTenant(tenantId);
                await deps.tenantService.logAuditAction(
                  adminUser.id,
                  "suspend_tenant",
                  "tenant",
                  tenantId,
                  {},
                  ip
                );
                return jsonResponse({ message: "Tenant suspended successfully" });
              } catch (error) {
                const handled = handleTenantValidation(error, "Suspend tenant");
                if (handled) return handled;
                throw error;
              }
            }

            if (action === "activate" && method === "POST") {
              try {
                await deps.tenantService.activateTenant(tenantId);
                await deps.tenantService.logAuditAction(
                  adminUser.id,
                  "activate_tenant",
                  "tenant",
                  tenantId,
                  {},
                  ip
                );
                return jsonResponse({ message: "Tenant activated successfully" });
              } catch (error) {
                const handled = handleTenantValidation(error, "Activate tenant");
                if (handled) return handled;
                throw error;
              }
            }

            break;
          }

          if (resource.length >= 5 && resource[2] === "users") {
            const userId = resource[3];
            const userAction = resource[4];

            if (!userId || !userAction) {
              break;
            }

            if (userAction === "revoke-sessions" && method === "POST") {
              await deps.tenantService.revokeUserSessions(tenantId, userId);
              await deps.tenantService.logAuditAction(
                adminUser.id,
                "revoke_user_sessions",
                "user",
                `${tenantId}:${userId}`,
                {},
                ip
              );
              return jsonResponse({ message: "User sessions revoked" });
            }

            if (userAction === "support-session" && method === "POST") {
              const body = await parseJsonBody(request);
              const minutes = body?.minutes;
              const sessionToken = await deps.tenantService.createSupportSession(tenantId, userId, minutes);
              await deps.tenantService.logAuditAction(
                adminUser.id,
                "create_support_session",
                "user",
                `${tenantId}:${userId}`,
                { minutes },
                ip
              );
              return jsonResponse({ session: sessionToken });
            }
          }

          break;
        }

        case "metrics": {
          if (resource.length === 1 && method === "GET") {
            const metrics = await deps.tenantService.getSystemMetrics();
            return jsonResponse({ metrics });
          }
          break;
        }

        case "overview": {
          if (resource.length === 1 && method === "GET") {
            const overview = await deps.tenantService.getAdminOverview();
            return jsonResponse({ overview });
          }
          break;
        }

        case "users": {
          if (resource.length >= 2 && resource[1] === "search" && method === "GET") {
            const params = url.searchParams;
            const q = params.get("q") || undefined;
            const tenantId = params.get("tenantId") || undefined;
            const limit = params.get("limit") ? Number(params.get("limit")) : undefined;
            const results = await deps.tenantService.searchUsersAcrossTenants({ query: q, tenantId, limit });
            await deps.tenantService.logAuditAction(
              adminUser.id,
              "search_users",
              "system",
              tenantId || "all",
              { query: q, limit },
              ip
            );
            return jsonResponse({ users: results });
          }
          break;
        }

        case "security": {
          if (resource.length >= 2 && resource[1] === "settings") {
            if (method === "GET") {
              const settings = await deps.tenantService.getSecuritySettings();
              return jsonResponse({ settings });
            }

            if (method === "PUT") {
              const body = await parseJsonBody(request) as Partial<SecuritySettings>;
              const settings = await deps.tenantService.updateSecuritySettings(adminUser.id, body ?? {});
              await deps.tenantService.logAuditAction(
                adminUser.id,
                "update_security_settings",
                "system",
                "security",
                body ?? {},
                ip
              );
              return jsonResponse({ settings });
            }
          }

          // IP Blocking endpoints
          if (resource.length >= 2 && resource[1] === "ip-blocklist") {
            if (method === "GET") {
              const blocklist = await deps.tenantService.getIpBlocklist();
              return jsonResponse({ blocklist });
            }

            if (method === "POST" && resource.length === 2) {
              const body = await parseJsonBody(request);
              const entry = await deps.tenantService.blockIp(adminUser.id, {
                ip: body?.ip,
                reason: body?.reason || "Blocked via admin",
                blockedBy: adminUser.id,
                expiresInMs: body?.expiresInMs,
              });
              return jsonResponse({ entry });
            }

            if (method === "DELETE" && resource.length === 3) {
              const ipToUnblock = decodeURIComponent(resource[2]);
              const result = await deps.tenantService.unblockIp(adminUser.id, ipToUnblock);
              return jsonResponse({ success: result });
            }
          }

          // Check if IP is blocked
          if (resource.length === 3 && resource[1] === "ip-check") {
            const ipToCheck = decodeURIComponent(resource[2]);
            const result = await deps.tenantService.isIpBlocked(ipToCheck);
            return jsonResponse(result);
          }
          break;
        }

        case "support-sessions": {
          if (resource.length === 1 && method === "GET") {
            const sessions = await deps.tenantService.listActiveSupportSessions();
            return jsonResponse({ sessions });
          }

          if (resource.length === 3 && method === "DELETE") {
            const tenantId = resource[1];
            const sessionId = resource[2];
            if (!tenantId || !sessionId) {
              break;
            }
            const revoked = await deps.tenantService.revokeSupportSession(tenantId, sessionId);
            if (revoked) {
              await deps.tenantService.logAuditAction(
                adminUser.id,
                "revoke_support_session",
                "tenant",
                tenantId,
                { sessionId },
                ip
              );
            }
            return jsonResponse({ revoked });
          }
          break;
        }

        case "connections": {
          if (resource.length >= 2 && resource[1] === "prune" && method === "POST") {
            const body = await parseJsonBody(request);
            const force = Boolean(body?.force);
            const result = await deps.tenantService.pruneIdleConnections(force);
            await deps.tenantService.logAuditAction(
              adminUser.id,
              "prune_connections",
              "system",
              "connection_pool",
              { force, pruned: result.pruned },
              ip
            );
            return jsonResponse(result);
          }
          break;
        }

        case "audit-logs": {
          if (resource.length === 1 && method === "GET") {
            const params = url.searchParams;
            const limit = params.get("limit") || "50";
            const offset = params.get("offset") || "0";
            const action = params.get("action") || undefined;
            const targetType = params.get("targetType") || undefined;
            const targetId = params.get("targetId") || undefined;
            const adminUserId = params.get("adminUserId") || undefined;
            const from = params.get("from") || undefined;
            const to = params.get("to") || undefined;
            const search = params.get("search") || undefined;
            const tenantStatus = params.get("tenantStatus") || undefined;

            const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
            const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

            const auditLogs = await deps.tenantService.getAuditLogs(limitNum, offsetNum, {
              action,
              targetType,
              targetId,
              adminUserId,
              from,
              to,
              search,
              tenantStatus: tenantStatus || undefined
            });

            return jsonResponse(auditLogs);
          }
          break;
        }

        default:
          break;
      }

      return jsonResponse({ error: "Not Found" }, { status: 404 });
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }

      console.error("[Admin API] Unexpected error:", error);
      return jsonResponse({ error: "Internal server error" }, { status: 500 });
    }
  }

  async function handleAdminLogStream(
    request: Request,
    context: AdminApiContext = {}
  ): Promise<Response | null> {
    const url = new URL(request.url);
    if (url.pathname !== "/admin/log-stream") {
      return null;
    }

    if (request.method.toUpperCase() !== "GET") {
      return jsonResponse({ error: "Method Not Allowed" }, { status: 405 });
    }

    try {
      await ensureTenantManagerInitialized();
    } catch (error) {
      console.error("[Admin Log Stream] Failed to initialize tenant manager:", error);
      return jsonResponse({ error: "Failed to initialize tenant manager" }, { status: 500 });
    }

    const headers = new Headers(request.headers);
    try {
      await ensureAdminSession(headers);
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }
      console.error("[Admin Log Stream] Session validation error:", error);
      return jsonResponse({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const ip = getClientIp(context);
    if (ip) {
      console.debug(`[Admin Log Stream] Client connected from ${ip}`);
    }

    let cleanup: (() => void) | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          try {
            const payload = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(payload));
          } catch (error) {
            console.error("[Admin Log Stream] Failed to encode event:", error);
          }
        };

        const listener = (event: LogEvent) => {
          sendEvent("log", event);
        };

        sendEvent("ready", { ok: true });
        deps.addLogListener(listener);

        const keepAlive = setInterval(() => {
          controller.enqueue(encoder.encode(":keep-alive\n\n"));
        }, 15000);

        const abortHandler = () => {
          cleanup?.();
          controller.close();
        };

        request.signal?.addEventListener("abort", abortHandler);

        cleanup = () => {
          if (cleanup === null) return;
          clearInterval(keepAlive);
          deps.removeLogListener(listener);
          request.signal?.removeEventListener("abort", abortHandler);
          cleanup = null;
        };
      },
      cancel() {
        cleanup?.();
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  }

  return {
    handleAdminApiRequest,
    handleAdminLogStream
  };
}
