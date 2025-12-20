import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { auth } from "./auth.js";
import { devEnabled, env } from "./env.js";
import type { AuthConfig } from "./config/auth-mode.js";
import { getTenantAuth } from "./multi-tenant/auth-factory.js";
import { tenantManager } from "./multi-tenant/connection-manager.js";

// Auth mode detection
type AuthMode = "cookie" | "apiKey" | "bearer";
type BetterAuthInstance = {
  api: any;
};

interface AuthContext {
  authInstance: BetterAuthInstance;
  tenantId?: string;
}

type DevRequest = FastifyRequest & { devAuthContext?: AuthContext };

const devEndpointsRequireAdmin = env.DEV_ENDPOINTS_REQUIRE_ADMIN === "true";
const devEndpointsIpAllowlist = env.DEV_ENDPOINTS_IP_ALLOWLIST
  .split(",")
  .map((ip) => ip.trim())
  .filter(Boolean);

function detectAuthMode(headers: Record<string, any>): AuthMode {
  if (headers["x-api-key"]) return "apiKey";
  if (headers.authorization?.startsWith("Bearer ")) return "bearer";
  return "cookie";
}

// Helper to convert Fastify headers to Headers object
function toHeaders(reqHeaders: FastifyRequest["headers"]): Headers {
  const headers = new Headers();
  for (const [k, v] of Object.entries(reqHeaders)) {
    if (v) headers.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  return headers;
}

function extractTenantHint(request: FastifyRequest): string | null {
  const header = request.headers["x-tenant-id"];
  if (Array.isArray(header)) {
    if (header.length > 0 && header[0]) {
      return header[0] as string;
    }
  } else if (typeof header === "string" && header.trim()) {
    return header.trim();
  }

  const query = (request.query as any)?.tenantId;
  if (typeof query === "string" && query.trim()) {
    return query.trim();
  }

  return null;
}

function getRequestIp(request: FastifyRequest): string | null {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    const first = forwarded[0]?.trim();
    if (first) return first;
  }

  return request.ip || null;
}

function enforceDevEndpointIpAllowlist(request: FastifyRequest) {
  if (devEndpointsIpAllowlist.length === 0) {
    return;
  }

  const ip = getRequestIp(request);
  if (!ip || !devEndpointsIpAllowlist.includes(ip)) {
    throw { status: 403, message: "IP not allowed for dev endpoints" };
  }
}

async function resolveAuthContext(config: AuthConfig, request: FastifyRequest): Promise<AuthContext> {
  if (config.mode === "single") {
    return {
    authInstance: { api: (auth as any).api } as BetterAuthInstance,
      tenantId: config.singleTenantId
    };
  }

  const tenantHint = extractTenantHint(request);
  if (!tenantHint) {
    throw { status: 400, message: "X-Tenant-Id header is required for dev endpoints in multi-tenant mode" };
  }

  const tenant = tenantManager.resolveTenant(tenantHint);
  if (!tenant) {
    throw { status: 404, message: `Tenant not found: ${tenantHint}` };
  }

  if (tenant.status !== "active") {
    throw { status: 403, message: `Tenant ${tenant.id} is not active` };
  }

  return {
    authInstance: getTenantAuth(tenant.id) as unknown as BetterAuthInstance,
    tenantId: tenant.id
  };
}

function getAuthContext(config: AuthConfig, request: DevRequest): AuthContext {
  if (request.devAuthContext) {
    return request.devAuthContext;
  }

  throw { status: 500, message: "Auth context not initialized" };
}

// Auth helpers
async function requireUser(authInstance: BetterAuthInstance, headers: Headers) {
  const session = await authInstance.api.getSession({ headers });
  if (!session?.user) {
    throw { status: 401, message: "Authentication required" };
  }
  return session;
}

async function requireAdmin(authInstance: BetterAuthInstance, headers: Headers) {
  const session = await requireUser(authInstance, headers);
  if (session.user.role !== "admin") {
    throw { status: 403, message: "Admin access required" };
  }
  return session;
}

async function requireOrgRole(authInstance: BetterAuthInstance, headers: Headers, orgId: string, roles: string[]) {
  const session = await requireUser(authInstance, headers);

  // Get user's organization memberships
  const organizations = await authInstance.api.listOrganizations({ headers });
  
  const membership = organizations?.find((org: any) => 
    org.id === orgId && roles.includes(org.role)
  );
  
  if (!membership) {
    throw { status: 403, message: "Insufficient organization permissions" };
  }
  
  return session;
}

// Dev endpoints registration
export function registerDevEndpoints(app: FastifyInstance, config: AuthConfig) {
  console.log("Registering dev endpoints, devEnabled:", devEnabled);
  
  if (!devEnabled) {
    console.log("Dev endpoints disabled, registering 404 handler");
    // Register 404 handler for all /dev/* routes when dev endpoints are disabled
    app.register((devApp) => {
      devApp.addHook("preHandler", async (request, reply) => {
        if (request.url.startsWith("/dev")) {
          console.log("Dev endpoint accessed but disabled:", request.url);
          reply.status(404).send({ error: "Not found" });
        }
      });
    });
    return;
  }

  console.log("Dev endpoints enabled, registering routes...");

  // Register dev routes with /dev prefix
  app.register((devApp) => {
    devApp.addHook("preHandler", async (request, reply) => {
      try {
        enforceDevEndpointIpAllowlist(request);

        // Skip authentication for JWKS endpoint (must be public for JWT validation)
        if (request.url === "/dev/jwks.json") {
          return;
        }

        // All other dev endpoints require authentication
        const headers = toHeaders(request.headers);
        const context = await resolveAuthContext(config, request);
        (request as DevRequest).devAuthContext = context;
        if (devEndpointsRequireAdmin) {
          await requireAdmin(context.authInstance, headers);
        } else {
          await requireUser(context.authInstance, headers);
        }
      } catch (error: any) {
        reply.status(error.status || 500).send({ error: error.message });
      }
    });

    // GET /dev/whoami - Identity and memberships
    devApp.get("/dev/whoami", async (request, reply) => {
      try {
        const headers = toHeaders(request.headers);
        const context = (request as DevRequest).devAuthContext || await resolveAuthContext(config, request);
        const session = await requireUser(context.authInstance, headers);
        const mode = detectAuthMode(request.headers);

        // Get organization memberships
        const organizations = await context.authInstance.api.listOrganizations({ headers }).catch(() => []);

        reply.send({
          mode,
          tenant: context.tenantId,
          user: {
            id: session.user.id,
            email: session.user.email,
            role: session.user.role
          },
          memberships: organizations || []
        });
      } catch (error: any) {
        reply.status(error.status || 500).send({ error: error.message });
      }
    });

    // POST /dev/api-keys - Create API key
    devApp.post("/dev/api-keys", async (request, reply) => {
      try {
        const headers = toHeaders(request.headers);
        const context = (request as DevRequest).devAuthContext || await resolveAuthContext(config, request);
        const session = await requireUser(context.authInstance, headers);
        const body = request.body as any;

        const targetUserId = body.userId || session.user.id;

        // Check if user can create API key for target user
        if (targetUserId !== session.user.id && session.user.role !== "admin") {
          return reply.status(403).send({ error: "Can only create API keys for yourself or as admin" });
        }

        const result = await context.authInstance.api.createApiKey({
          headers,
          body: {
            userId: targetUserId,
            name: body.label || "Dev API Key",
            expiresIn: body.expiresInDays ? body.expiresInDays * 24 * 60 * 60 : null
          }
        });

        reply.send({
          key: result.key,
          keyId: result.id,
          userId: targetUserId,
          label: body.label,
          expiresAt: result.expiresAt
        });
      } catch (error: any) {
        reply.status(error.status || 500).send({ error: error.message });
      }
    });

    // GET /dev/api-keys - List API keys
    devApp.get("/dev/api-keys", async (request, reply) => {
      try {
        const headers = toHeaders(request.headers);
        const context = (request as DevRequest).devAuthContext || await resolveAuthContext(config, request);
        const session = await requireUser(context.authInstance, headers);
        const query = request.query as any;

        const targetUserId = query.userId || session.user.id;

        // Check if user can list API keys for target user
        if (targetUserId !== session.user.id && session.user.role !== "admin") {
          return reply.status(403).send({ error: "Can only list your own API keys or as admin" });
        }

        const keys = await context.authInstance.api.listApiKeys({
          headers,
          query: { userId: targetUserId }
        });

        reply.send({ keys });
      } catch (error: any) {
        reply.status(error.status || 500).send({ error: error.message });
      }
    });

    // DELETE /dev/api-keys/:keyId - Revoke API key
    devApp.delete("/dev/api-keys/:keyId", async (request, reply) => {
      try {
        const headers = toHeaders(request.headers);
        const context = (request as DevRequest).devAuthContext || await resolveAuthContext(config, request);
        await requireUser(context.authInstance, headers);
        const params = request.params as any;

        await context.authInstance.api.deleteApiKey({
          headers,
          body: { keyId: params.keyId }
        });

        reply.send({ success: true });
      } catch (error: any) {
        reply.status(error.status || 500).send({ error: error.message });
      }
    });

    // POST /dev/jwt/issue - Issue JWT
    devApp.post("/dev/jwt/issue", async (request, reply) => {
      try {
        const headers = toHeaders(request.headers);
        const context = (request as DevRequest).devAuthContext || await resolveAuthContext(config, request);
        const session = await requireUser(context.authInstance, headers);
        const body = request.body as any;

        const targetUserId = body.userId || session.user.id;

        // Check if user can issue JWT for target user
        if (targetUserId !== session.user.id && session.user.role !== "admin") {
          return reply.status(403).send({ error: "Can only issue JWT for yourself or as admin" });
        }

        const ttl = body.ttlSeconds || 1800; // 30 minutes default
        const expiresAt = new Date(Date.now() + ttl * 1000);

        // For JWT, we create a session token and let JWT plugin handle it
        const authUrl = env.BETTER_AUTH_URL;
        const tokenResponse = await fetch(`${authUrl}/api/auth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': headers.get('cookie') || '',
            'Authorization': headers.get('authorization') || '',
            'x-api-key': headers.get('x-api-key') || '',
            ...(config.mode === 'multi' && context.tenantId ? { 'X-Tenant-Id': context.tenantId } : {})
          },
          body: JSON.stringify({
            audience: body.audience,
            expiresIn: ttl
          })
        });

        if (!tokenResponse.ok) {
          throw { status: 400, message: "Failed to create JWT token" };
        }

        const tokenData = await tokenResponse.json();

        reply.send({
          token: tokenData.token,
          expiresAt
        });
      } catch (error: any) {
        reply.status(error.status || 500).send({ error: error.message });
      }
    });

    // GET /dev/jwks.json - JWKS endpoint (public, no auth required)
    devApp.get("/dev/jwks.json", async (request, reply) => {
      try {
        // Proxy to the built-in Better Auth JWKS endpoint
        const authUrl = env.BETTER_AUTH_URL;
        const maybeContext = config.mode === 'multi'
          ? await resolveAuthContext(config, request)
          : { tenantId: config.singleTenantId };

        const jwksResponse = await fetch(`${authUrl}/api/auth/jwks`, {
          method: 'GET',
          headers: {
            ...(config.mode === 'multi' && maybeContext?.tenantId ? { 'X-Tenant-Id': maybeContext.tenantId } : {})
          }
        });
        if (!jwksResponse.ok) {
          throw { status: 500, message: "Failed to fetch JWKS" };
        }
        const jwks = await jwksResponse.json();
        reply.send(jwks);
      } catch (error: any) {
        reply.status(error.status || 500).send({ error: error.message });
      }
    });

    // POST /dev/orgs - Create organization
    devApp.post("/dev/orgs", async (request, reply) => {
      try {
        const headers = toHeaders(request.headers);
        const context = (request as DevRequest).devAuthContext || await resolveAuthContext(config, request);
        await requireUser(context.authInstance, headers);
        const body = request.body as any;

        const org = await context.authInstance.api.createOrganization({
          headers,
          body: {
            name: body.name,
            slug: body.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
          }
        });

        reply.send({ org });
      } catch (error: any) {
        reply.status(error.status || 500).send({ error: error.message });
      }
    });

    // POST /dev/orgs/:orgId/members - Add member to organization
    devApp.post("/dev/orgs/:orgId/members", async (request, reply) => {
      try {
        const headers = toHeaders(request.headers);
        const context = (request as DevRequest).devAuthContext || await resolveAuthContext(config, request);
        const params = request.params as any;
        const body = request.body as any;

        await requireOrgRole(context.authInstance, headers, params.orgId, ["owner", "admin"]);

        const member = await context.authInstance.api.createInvitation({
          headers,
          body: {
            organizationId: params.orgId,
            email: body.email,
            role: body.role || "member"
          }
        });

        reply.send({ member });
      } catch (error: any) {
        reply.status(error.status || 500).send({ error: error.message });
      }
    });

    // PATCH /dev/orgs/:orgId/members/:userId - Update member role
    devApp.patch("/dev/orgs/:orgId/members/:userId", async (request, reply) => {
      try {
        const headers = toHeaders(request.headers);
        const context = (request as DevRequest).devAuthContext || await resolveAuthContext(config, request);
        const params = request.params as any;
        const body = request.body as any;

        await requireOrgRole(context.authInstance, headers, params.orgId, ["owner", "admin"]);

        const member = await context.authInstance.api.updateMemberRole({
          headers,
          body: {
            organizationId: params.orgId,
            memberId: params.userId,
            role: body.role
          }
        });

        reply.send({ member });
      } catch (error: any) {
        reply.status(error.status || 500).send({ error: error.message });
      }
    });

    // GET /dev/orgs/:orgId/members - List organization members
    devApp.get("/dev/orgs/:orgId/members", async (request, reply) => {
      try {
        const headers = toHeaders(request.headers);
        const context = (request as DevRequest).devAuthContext || await resolveAuthContext(config, request);
        const params = request.params as any;

        await requireOrgRole(context.authInstance, headers, params.orgId, ["owner", "admin", "member"]);

        const organization = await context.authInstance.api.getFullOrganization({
          headers,
          query: { organizationId: params.orgId }
        });

        const members = organization?.members || [];

        reply.send({ members });
      } catch (error: any) {
        reply.status(error.status || 500).send({ error: error.message });
      }
    });

    // GET /dev/admin/users - List users (admin only)
    devApp.get("/dev/admin/users", async (request, reply) => {
      try {
        const headers = toHeaders(request.headers);
        const context = (request as DevRequest).devAuthContext || await resolveAuthContext(config, request);
        await requireAdmin(context.authInstance, headers);
        const query = request.query as any;

        const users = await context.authInstance.api.listUsers({
          headers,
          query: {
            limit: query.limit || 50
          }
        });

        reply.send({ users });
      } catch (error: any) {
        reply.status(error.status || 500).send({ error: error.message });
      }
    });

    // POST /dev/admin/impersonate - Impersonate user (admin only, DEV ONLY)
    devApp.post("/dev/admin/impersonate", async (request, reply) => {
      try {
        const headers = toHeaders(request.headers);
        const context = (request as DevRequest).devAuthContext || await resolveAuthContext(config, request);
        await requireAdmin(context.authInstance, headers);
        const body = request.body as any;

        const result = await context.authInstance.api.impersonateUser({
          headers,
          body: {
            userId: body.userId
          }
        });

        if (body.as === "jwt") {
          reply.send({ token: result.session.token });
        } else {
          reply
            .header("set-cookie", `better-auth.session_token=${result.session.token}; Path=/; HttpOnly; SameSite=lax; Max-Age=604800`)
            .send({ success: true, message: "Impersonation session set" });
        }
      } catch (error: any) {
        reply.status(error.status || 500).send({ error: error.message });
      }
    });

  }, { prefix: "" }); // No additional prefix since routes already have /dev
}
