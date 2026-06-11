/**
 * createFastifyApp
 *
 * Builds and configures a Fastify instance from an AppContainer.
 * All middleware and routes are registered from the packages layer.
 * No src/ imports — the container provides every dependency.
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { AppContainer } from '../../apps/api/src/container';

import { registerRequestId }      from './middleware/request-id.js';
import { registerSecurityHeaders } from './middleware/security-headers.js';
import { registerRateLimit }       from './middleware/rate-limit.js';
import { registerIpBlocking }      from './middleware/ip-blocking.js';

import { registerHealthRoutes }     from './routes/health.routes.js';
import { registerAdminRoutes }      from './routes/admin.routes.js';
import { registerTenantAuthRoutes } from './routes/tenant-auth.routes.js';
import { registerDevRoutes }        from './routes/dev.routes.js';
import { registerStaticUiRoutes }   from './routes/static-ui.routes.js';

export async function createFastifyApp(container: AppContainer): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: container.config.nodeEnv === 'production' ? 'warn' : 'info',
    },
    trustProxy: true,
  });

  // ----------------------------------------------------------------
  // CORS
  // ----------------------------------------------------------------
  await app.register(import('@fastify/cors' as any), {
    origin: container.config.trustedOrigins.length > 0
      ? container.config.trustedOrigins
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  });

  // ----------------------------------------------------------------
  // Body parser
  // ----------------------------------------------------------------
  await app.register(import('@fastify/formbody' as any));

  // ----------------------------------------------------------------
  // Middleware (order matters)
  // ----------------------------------------------------------------
  registerRequestId(app);
  registerSecurityHeaders(app);
  registerRateLimit(app, { max: 300, windowMs: 60_000 });
  registerIpBlocking(app, container.useCases.security.checkIpBlocked);

  // ----------------------------------------------------------------
  // Routes
  // ----------------------------------------------------------------
  await registerHealthRoutes(app, container);
  await registerAdminRoutes(app, container);
  await registerTenantAuthRoutes(app, container);
  await registerDevRoutes(app, container);
  await registerStaticUiRoutes(app, container);

  // ----------------------------------------------------------------
  // 404 fallback
  // ----------------------------------------------------------------
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: 'NOT_FOUND', message: 'Route not found.' });
  });

  // ----------------------------------------------------------------
  // Error handler
  // ----------------------------------------------------------------
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  });

  return app;
}
