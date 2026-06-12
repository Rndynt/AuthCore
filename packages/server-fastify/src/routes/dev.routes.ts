import type { FastifyInstance } from 'fastify';
import type { AppContainer } from '../../../../apps/api/src/container.js';

/** Development-only endpoints. Only mounted when config.devEnabled is true. */
export async function registerDevRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  if (!container.config.devEnabled) return;

  app.get('/dev/tenants', async (_req, reply) => {
    const tenants = container.tenantRegistry.getAllTenants();
    return reply.send({ tenants, count: tenants.length });
  });

  app.get('/dev/metrics', async (_req, reply) =>
    reply.send({
      registry:    container.tenantRegistry.getStats?.() ?? null,
      connections: container.connectionManager.getStats?.() ?? null,
    }),
  );

  app.post('/dev/prune', async (_req, reply) => {
    const pruned = await container.connectionManager.pruneIdleConnectionsNow({ force: true });
    return reply.send({ pruned });
  });

  app.get('/dev/health', async (_req, reply) => {
    const result = await container.httpHandlers.health.handle('ready');
    return reply.send(result);
  });

  console.log('[dev] Dev endpoints registered at /dev/*');
}
