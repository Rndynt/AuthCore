import Fastify from "fastify";
import cors from "@fastify/cors";
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

const app = Fastify({ logger: true });

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
        const base = `http://${request.headers.host}`;
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

        const base = `http://${request.headers.host}`;
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
      const session = await tenantAuth.api.getSession({ headers });
      reply.send({
        ...session,
        tenant: {
          id: tenantId,
          slug: req.tenantSlug
        }
      });
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
      const base = `http://${request.headers.host}`;
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
      console.log(`📊 Active tenants: ${stats.totalTenants}`);
      console.log(`📋 Tenants:`, stats.tenants.map(t => `${t.id} (${t.name})`).join(', '));
    }

    // Register routes after initialization
    registerRoutes();

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

    await app.listen({ host: "0.0.0.0", port: env.PORT });
    app.log.info(`Auth service running on port ${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

startServer();
