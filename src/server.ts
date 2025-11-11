import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import { auth } from "./auth.js";
import { env, trustedOrigins, devEnabled } from "./env.js";
import { registerDevEndpoints } from "./dev.js";
import { getAuthConfig, displayAuthConfig, validateAuthConfig } from "./config/auth-mode.js";
import { getFeatureFlags, displayFeatureFlags } from "./config/features.js";
import { tenantManager } from "./multi-tenant/connection-manager.js";
import { SingleTenantManager } from "./multi-tenant/single-tenant-manager.js";
import { SubTenantManager } from "./multi-tenant/sub-tenant-manager.js";
import { getTenantAuth } from "./multi-tenant/auth-factory.js";
import { tenantMiddleware, type TenantRequest } from "./multi-tenant/middleware.js";
import { adminAuthMiddleware } from "./admin-auth-middleware.js";
import { registerAdminRoutes } from "./admin/routes.js";
import { getRequestOrigin } from "./utils/http.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({ logger: true, trustProxy: true });

app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const ok = trustedOrigins.includes(origin);
    cb(null, ok);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "x-api-key", "X-Tenant-Id"]
});

app.setErrorHandler((err, _req, reply) => {
  app.log.error({ err }, 'unhandled-error');
  reply.status(err.statusCode ?? 500).send({ error: 'internal_error' });
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
    app.route({
      method: ["GET", "POST"],
      url: "/api/auth/*",
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
    app.route({
      method: ["GET", "POST"],
      url: "/api/auth/*",
      preHandler: tenantMiddleware,
      handler: async (request: TenantRequest, reply) => {
        const tenantId = request.tenantId!;
        const tenantAuth = getTenantAuth(tenantId);

        const base = getRequestOrigin(request);
        const url = new URL(request.url, base);
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
      }
    });

    // Helper route to resolve current session with tenant support
    app.get("/me", {
      preHandler: tenantMiddleware
    }, async (req: TenantRequest, reply) => {
      const tenantId = req.tenantId!;
      const tenantAuth = getTenantAuth(tenantId);

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
      preHandler: tenantMiddleware
    }, async (req: TenantRequest, reply) => {
      const tenant = tenantManager.getTenant(req.tenantId!);
      reply.send({
        tenant: {
          id: tenant!.id,
          name: tenant!.name,
          slug: tenant!.slug,
          status: tenant!.status
        }
      });
    });

    // Admin: List all tenants (protected)
    app.get("/admin/tenants", {
      preHandler: adminAuthMiddleware
    }, async (req, reply) => {
      const tenants = tenantManager.getAllTenants();
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
      preHandler: adminAuthMiddleware
    }, async (req, reply) => {
      const stats = tenantManager.getStats();
      reply.send(stats);
    });

    // Nested tenancy routes (if enabled)
    if (features.nestedTenancy && subTenantManager) {
      const stManager = subTenantManager;
      app.get("/admin/sub-tenants/:applicationId", {
        preHandler: adminAuthMiddleware
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
  app.get("/healthz", async (req, reply) => {
    reply.send({ 
      ok: true,
      mode: authConfig.mode,
      features: {
        tenantRegistry: features.tenantRegistry,
        nestedTenancy: features.nestedTenancy
      }
    });
  });
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
    
    // Register admin routes (always available)
    await registerAdminRoutes(app);

    // Register dev endpoints (if enabled)
    if (features.devEndpoints) {
      console.log("Registering dev endpoints, devEnabled:", devEnabled);
      registerDevEndpoints(app);
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

    await app.listen({ host: "0.0.0.0", port: env.PORT });
    app.log.info(`Auth service running on port ${env.PORT}`);
    console.log(`✅ Admin UI available at http://0.0.0.0:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

startServer();
