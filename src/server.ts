import Fastify, { type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import { createRequire } from "node:module";
import { randomUUID } from "crypto";
import { auth } from "./auth.js";
import { env, trustedOrigins, devEnabled, isOriginTrusted } from "./env.js";
import { registerDevEndpoints } from "./dev.js";
import { getAuthConfig, displayAuthConfig, validateAuthConfig } from "./config/auth-mode.js";
import { getFeatureFlags, displayFeatureFlags } from "./config/features.js";
import { tenantManager, registerTenantManagerShutdownHandlers } from "./multi-tenant/connection-manager.js";
import { tenantService } from "./application/tenant-service.js";
import { SingleTenantManager } from "./multi-tenant/single-tenant-manager.js";
import { SubTenantManager } from "./multi-tenant/sub-tenant-manager.js";
import { getTenantAuth } from "./multi-tenant/auth-factory.js";
import { tenantMiddleware, normalizeTenantIdentifier, type TenantRequest } from "./multi-tenant/middleware.js";
import { registerAdminRoutes } from "./admin/routes.js";
import { adminSessionMiddleware } from "./admin/middleware.js";
import { getRequestOrigin } from "./utils/http.js";
import requestLogger from "./utils/request-logger.js";
import { getRequestMetricsSnapshot } from "./utils/request-metrics.js";
import { registerRateLimiting, createAuthRateLimit, createGeneralRateLimit, createHealthRateLimit } from "./utils/rate-limit.js";
import { 
  AppError, 
  isAppError, 
  handleErrorResponse,
  InternalServerError,
  ValidationError 
} from "./utils/errors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV !== "production";
const isProduction = process.env.NODE_ENV === "production";

const require = createRequire(import.meta.url);

const prettyTransport = (() => {
  if (!isDev) {
    return null;
  }

  try {
    require.resolve("pino-pretty");
  } catch {
    return null;
  }

  return {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss.l",
      ignore: "pid,hostname"
    }
  } as const;
})();

const app = Fastify({
  logger: prettyTransport ? { transport: prettyTransport } : true,
  trustProxy: true,
  genReqId: () => crypto.randomUUID()  // Enable request ID generation (Poin 14)
});

// Add request ID and security headers to all responses
app.addHook('onRequest', async (request, reply) => {
  const requestId = request.id || randomUUID();
  reply.header('X-Request-Id', requestId);
  
  // Security headers
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // HSTS in production
  if (isProduction) {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
});

if (isDev && !prettyTransport) {
  app.log.warn(
    "Pretty logging disabled: install 'pino-pretty' to enable pretty-printed logs in development."
  );
}

app.register(requestLogger);

// Register rate limiting
registerRateLimiting(app).catch(err => {
  console.error('Failed to register rate limiting:', err);
});

app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const ok = isOriginTrusted(origin);
    cb(null, ok);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "x-api-key", "X-Tenant-Id", "X-Request-Id"]
});

// IP Blocking middleware - check against security settings blocklist
app.addHook('onRequest', async (request, reply) => {
  // Skip IP blocking for health checks and static assets
  const url = request.url;
  if (url === '/healthz' || url.startsWith('/_next/') || url.includes('.')) {
    return;
  }
  
  try {
    const { tenantService: ts } = await import('./application/tenant-service.js');
    const ip = request.ip;
    if (ip) {
      const result = await ts.isIpBlocked(ip);
      if (result.blocked) {
        reply.code(403).send({
          error: 'IP_BLOCKED',
          message: 'Your IP address has been blocked',
          reason: result.entry?.reason
        });
        return;
      }
    }
  } catch {
    // Don't block requests if IP check fails - fail open for availability
  }
});

// Global Error Handler with centralized error handling (Poin 4)
app.setErrorHandler((err, req, reply) => {
  if (isAppError(err)) {
    handleErrorResponse(err, reply);
    return;
  }
  
  // Log unexpected errors
  app.log.error({ err, requestId: req.id }, 'unhandled-error');
  
  // Use centralized error response
  handleErrorResponse(
    new InternalServerError(
      process.env.NODE_ENV !== 'production' && err instanceof Error 
        ? err.message 
        : 'An unexpected error occurred'
    ),
    reply
  );
});

// Load configuration
const authConfig = getAuthConfig();
const features = getFeatureFlags(authConfig);

// Managers (conditionally initialized)
let singleTenantManager: SingleTenantManager | null = null;
let subTenantManager: SubTenantManager | null = null;

/**
 * Register routes based on mode
 */
function registerRoutes() {
  if (authConfig.mode === 'single') {
    // Single-tenant mode: direct auth routes without tenant middleware
    // Apply rate limiting to auth endpoints
    app.route({
      method: ["GET", "POST"],
      url: "/api/auth/*",
      config: { rateLimit: createAuthRateLimit() },
      handler: async (request, reply) => {
        const base = getRequestOrigin(request);
        const url = new URL(request.url, base);
        const headers = new Headers();
        for (const [k, v] of Object.entries(request.headers)) {
          if (v) headers.set(k, Array.isArray(v) ? v.join(",") : String(v));
        }

        const body = request.body
          ? (typeof request.body === "string" ? request.body : JSON.stringify(request.body))
          : undefined;

        const res = await auth.handler(new Request(url.toString(), {
          method: request.method,
          headers,
          body
        }));

        reply.status(res.status);
        res.headers.forEach((val, key) => reply.header(key, val));
        const text = await res.text().catch(() => "");
        reply.send(text);
      }
    });

    // Simple info endpoint
    app.get("/info", async (req, reply) => {
      const info = singleTenantManager?.getTenantInfo();
      reply.send({
        mode: 'single',
        tenant: info
      });
    });
  } else {
    // Multi-tenant mode: routes with tenant middleware
    const forwardTenantAuth = async (
      request: TenantRequest,
      reply: FastifyReply,
      options?: { stripTenantPrefix?: boolean }
    ) => {
      const tenantId = request.tenantId!;
      const tenantAuth = await getTenantAuth(tenantId);

      const base = getRequestOrigin(request);
      const url = new URL(request.url, base);
      if (options?.stripTenantPrefix) {
        url.pathname = url.pathname.replace(/^\/tenant\/[^/]+\/api\/auth/, "/api/auth");
      }

      const headers = new Headers();
      for (const [k, v] of Object.entries(request.headers)) {
        if (v) headers.set(k, Array.isArray(v) ? v.join(",") : String(v));
      }

      const body = request.body
        ? (typeof request.body === "string" ? request.body : JSON.stringify(request.body))
        : undefined;

      const res = await tenantAuth.handler(new Request(url.toString(), {
        method: request.method,
        headers,
        body
      }));

      reply.status(res.status);
      res.headers.forEach((val, key) => reply.header(key, val));
      const text = await res.text().catch(() => "");
      reply.send(text);
    };

    const resolveTenantFromPath = async (request: TenantRequest, reply: FastifyReply) => {
      const { tenantId } = request.params as { tenantId?: string };

      if (!tenantId) {
        reply.code(400).send({
          error: 'TENANT_REQUIRED',
          message: 'Tenant identifier required. Provide via X-Tenant-Id header or subdomain.',
          examples: {
            header: 'X-Tenant-Id: pos',
            subdomain: 'pos.your-auth-domain.com'
          }
        });
        return;
      }

      const normalizedIdentifier = normalizeTenantIdentifier(tenantId);
      if (!normalizedIdentifier) {
        reply.code(400).send({
          error: 'TENANT_INVALID',
          message: `Tenant identifier '${tenantId}' is not valid. Use lowercase letters, numbers, dashes, or underscores.`,
          tenant: tenantId
        });
        return;
      }

      const tenant = tenantManager.resolveTenant(normalizedIdentifier);
      if (!tenant) {
        reply.code(404).send({
          error: 'TENANT_NOT_FOUND',
          message: `Tenant '${tenantId}' not found or inactive`,
          tenantId
        });
        return;
      }

      if (tenant.status !== 'active') {
        reply.code(403).send({
          error: 'TENANT_SUSPENDED',
          message: `Tenant '${tenant.id}' is ${tenant.status}`,
          tenantId: tenant.id,
          status: tenant.status
        });
        return;
      }

      request.tenantId = tenant.id;
      request.tenantSlug = tenant.slug;
    };

    app.route({
      method: ["GET", "POST"],
      url: "/api/auth/*",
      config: { rateLimit: createAuthRateLimit() },
      onRequest: tenantMiddleware,
      handler: (request: TenantRequest, reply) => forwardTenantAuth(request, reply)
    });

    app.route({
      method: ["GET", "POST"],
      url: "/tenant/:tenantId/api/auth/*",
      preHandler: resolveTenantFromPath,
      handler: (request: TenantRequest, reply) =>
        forwardTenantAuth(request, reply, { stripTenantPrefix: true })
    });

    // Helper route to resolve current session with tenant support
    app.get("/me", {
      onRequest: tenantMiddleware
    }, async (req: TenantRequest, reply) => {
      const tenantId = req.tenantId!;
      const tenantAuth = await getTenantAuth(tenantId);

      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v) headers.set(k, Array.isArray(v) ? v.join(",") : String(v));
      }
      
      try {
        const session = await tenantAuth.api.getSession({ headers } as any);
        reply.send({
          ...session,
          tenant: {
            id: tenantId,
            slug: req.tenantSlug
          }
        });
      } catch (error) {
        reply.code(401).send({ error: 'Unauthorized', tenant: { id: tenantId, slug: req.tenantSlug } });
      }
    });

    // Tenant info route
    app.get("/tenant/info", {
      onRequest: tenantMiddleware
    }, async (req: TenantRequest, reply) => {
      const tenant = await tenantService.getTenant(req.tenantId!);
      if (!tenant) {
        reply.code(404).send({ error: 'Tenant not found' });
        return;
      }
      reply.send({
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status
        }
      });
    });

    // Admin: List all tenants (protected)
    app.get("/admin/tenants", {
      preHandler: adminSessionMiddleware
    }, async (req, reply) => {
      const tenants = await tenantService.listTenants();
      reply.send({
        tenants: tenants.map(t => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          schema: t.schema_name,
          status: t.status,
          created_at: t.created_at
        }))
      });
    });

    // Admin: Connection stats (protected)
    app.get("/admin/stats", {
      preHandler: adminSessionMiddleware
    }, async (req, reply) => {
      const stats = tenantService.getConnectionStats();
      reply.send({
        generatedAt: new Date().toISOString(),
        connections: stats,
        requests: getRequestMetricsSnapshot()
      });
    });

    // Nested tenancy routes (if enabled)
    if (features.nestedTenancy && subTenantManager) {
      const stManager = subTenantManager;
      app.get("/admin/sub-tenants/:applicationId", {
        preHandler: adminSessionMiddleware
      }, async (req, reply) => {
        const { applicationId } = req.params as { applicationId: string };
        const subTenants = stManager.getApplicationSubTenants(applicationId);
        reply.send({ subTenants });
      });
    }
  }

  // Legacy route (available in all modes for backward compatibility)
  app.route({
    method: ["GET", "POST"],
    url: "/legacy/auth/*",
    handler: async (request, reply) => {
      reply.header("Deprecation", "true");
      reply.header("Sunset", "2025-06-30");
      reply.header(
        "Warning",
        '299 - "Deprecated: /legacy/auth/* will be removed after 2025-06-30. Use /api/auth/* instead."'
      );
      const base = getRequestOrigin(request);
      const url = new URL(request.url, base);
      const headers = new Headers();
      for (const [k, v] of Object.entries(request.headers)) {
        if (v) headers.set(k, Array.isArray(v) ? v.join(",") : String(v));
      }

      const body = request.body
        ? (typeof request.body === "string" ? request.body : JSON.stringify(request.body))
        : undefined;

      const res = await auth.handler(new Request(url.toString(), {
        method: request.method,
        headers,
        body
      }));

      reply.status(res.status);
      res.headers.forEach((val, key) => reply.header(key, val));
      const text = await res.text().catch(() => "");
      reply.send(text);
    }
  });

  // Health check route (all modes)
  app.get("/healthz", {
    config: { rateLimit: createHealthRateLimit() }
  }, async (req, reply) => {
    const health: Record<string, unknown> = {
      ok: true,
      mode: authConfig.mode,
      timestamp: new Date().toISOString(),
      features: {
        tenantRegistry: features.tenantRegistry,
        nestedTenancy: features.nestedTenancy
      }
    };

    // Add connection health in multi-tenant mode
    if (authConfig.mode !== 'single') {
      try {
        const connectionHealth = tenantManager.getHealthStatus();
        health.connections = {
          healthy: connectionHealth.healthy,
          issues: connectionHealth.issues,
          metrics: connectionHealth.metrics
        };
        if (!connectionHealth.healthy) {
          health.ok = false;
        }
      } catch {
        health.connections = { healthy: false, error: 'Failed to get connection health' };
        health.ok = false;
      }
    }

    const statusCode = health.ok ? 200 : 503;
    reply.status(statusCode).send(health);
  });

  // Tenant-specific health check (multi-tenant mode)
  if (authConfig.mode !== 'single') {
    app.get("/tenant/:tenantId/health", {
      preHandler: async (request, reply) => {
        const { tenantId } = request.params as { tenantId: string };
        const tenant = tenantManager.resolveTenant(tenantId);
        if (!tenant) {
          reply.code(404).send({ error: 'TENANT_NOT_FOUND', message: `Tenant '${tenantId}' not found` });
          return;
        }
        (request as any).resolvedTenant = tenant;
      }
    }, async (req, reply) => {
      const tenant = (req as any).resolvedTenant;
      
      try {
        const schemaValid = await tenantManager.validateTenantSchema(tenant.schema_name);
        const hasConnection = tenantManager.getStats().connectionDetails.some(
          (c: any) => c.tenantId === tenant.id
        );

        reply.send({
          ok: tenant.status === 'active' && schemaValid,
          tenantId: tenant.id,
          name: tenant.name,
          status: tenant.status,
          schemaValid,
          hasActiveConnection: hasConnection,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        reply.code(500).send({
          ok: false,
          tenantId: tenant.id,
          error: 'Health check failed'
        });
      }
    });
  }
}

const startServer = async () => {
  try {
    // Display configuration
    displayAuthConfig(authConfig);
    displayFeatureFlags(features);
    
    // Validate configuration
    validateAuthConfig(authConfig);

    // Initialize based on mode
    if (authConfig.mode === 'single') {
      // Single-tenant initialization
      console.log('🔄 Initializing single-tenant mode...');
      singleTenantManager = new SingleTenantManager(
        authConfig.singleTenantId!,
        authConfig.singleTenantSchema
      );
      await singleTenantManager.initialize();
      console.log('✅ Single-tenant mode ready');
    } else {
      // Multi-tenant initialization
      console.log('🔄 Initializing multi-tenant manager...');
      await tenantManager.initialize();
      console.log('✅ Multi-tenant manager initialized');

      // Initialize sub-tenant manager if nested tenancy enabled
      if (features.nestedTenancy) {
        console.log('🔄 Initializing sub-tenant manager...');
        subTenantManager = new SubTenantManager();
        await subTenantManager.initialize();
        console.log('✅ Sub-tenant manager initialized');
      }

      // Log tenant stats
      const stats = tenantManager.getStats();
      console.log(`📊 Active tenants: ${stats.activeTenants}`);
      console.log(`📋 Tenants:`, stats.tenants.map(t => `${t.id} (${t.name})`).join(', '));
    }

    // Register routes after initialization
    registerRoutes();
    
    // Register admin routes (multi-tenant only)
    if (authConfig.mode !== 'single') {
      await registerAdminRoutes(app);
    } else {
      app.log.info('Admin routes disabled in single-tenant mode.');
    }

    // Register dev endpoints (if enabled)
    if (features.devEndpoints) {
      console.log("Registering dev endpoints, devEnabled:", devEnabled);
      registerDevEndpoints(app, authConfig);
    } else {
      console.log("Dev endpoints disabled, registering 404 handler");
      app.all("/dev/*", async (req, reply) => {
        reply.code(404).send({ 
          error: "Not Found", 
          message: "Dev endpoints are disabled. Set ENABLE_DEV_ENDPOINTS=true to enable." 
        });
      });
    }

    // Serve Admin UI static files (after all API routes for proper priority)
    const adminUIPath = path.join(__dirname, "..", "admin-ui", "out");
    console.log(`📁 Serving Admin UI from: ${adminUIPath}`);
    
    // Add global hook to set cache control headers for static files
    app.addHook('onSend', async (request, reply) => {
      // Set cache control for static files and HTML (but not API responses)
      const isApiRoute = request.url.startsWith('/api/') || 
                         request.url.startsWith('/admin/') || 
                         request.url.startsWith('/legacy/') ||
                         request.url.startsWith('/dev/');
      
      if (!isApiRoute && !reply.hasHeader('Cache-Control')) {
        reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    });
    
    await app.register(fastifyStatic, {
      root: adminUIPath,
      prefix: "/",
    });

    // SPA fallback: serve index.html for non-API routes
    app.setNotFoundHandler(async (request, reply) => {
      // If reply was already sent, don't try to send again
      if (reply.sent) {
        return;
      }
      
      const urlPath = request.url;
      
      // Don't intercept API routes or static assets
      if (urlPath.startsWith("/api/") || 
          urlPath.startsWith("/admin/") || 
          urlPath.startsWith("/legacy/") ||
          urlPath.startsWith("/dev/") ||
          urlPath.startsWith("/_next/") ||
          urlPath.includes(".")) {
        reply.code(404).send({ error: "Not Found" });
        return;
      }
      
      // Serve index.html for all other routes (SPA routing)
      try {
        const indexPath = path.join(adminUIPath, "index.html");
        const content = await readFile(indexPath, "utf-8");
        reply.type("text/html");
        reply.header("Cache-Control", "no-cache, no-store, must-revalidate");
        reply.send(content);
      } catch (err) {
        reply.code(404).send({ error: "Not Found" });
      }
    });

    registerTenantManagerShutdownHandlers(tenantManager);
    await app.listen({ host: "0.0.0.0", port: env.PORT });
    app.log.info(`Auth service running on port ${env.PORT}`);
    console.log(`✅ Admin UI available at http://0.0.0.0:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

startServer();
