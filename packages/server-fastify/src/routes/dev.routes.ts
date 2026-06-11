import type { FastifyInstance } from 'fastify';
import type { AppContainer } from '../../../apps/api/src/container';

/**
 * Register development-only endpoints.
 * Only mounted when container.config.devEnabled is true.
 */
export async function registerDevRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  if (!container.config.devEnabled) return;

  app.get('/dev/tenants', async (_request, reply) => {
    const tenants = container.tenantRegistry.getAllTenants();
    return reply.send({ tenants, count: tenants.length });
  });

  app.get('/dev/metrics', async (_request, reply) => {
    return reply.send({
      registry: container.tenantRegistry.getStats?.() ?? null,
      connections: container.connectionManager.getStats?.() ?? null,
    });
  });

  app.post('/dev/prune', async (_request, reply) => {
    const pruned = await container.connectionManager.pruneIdleConnectionsNow({ force: true });
    return reply.send({ pruned });
  });

  console.log('[dev] Development endpoints registered at /dev/*');
}
