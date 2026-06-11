import type { FastifyInstance } from 'fastify';
import type { AppContainer } from '../../../apps/api/src/container';

/** Register /health and /ready endpoints. */
export async function registerHealthRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  app.get('/health', async (_request, reply) => {
    const result = await container.httpHandlers.health.handle('health');
    return reply.code(result.status === 'ok' ? 200 : 503).send(result);
  });

  app.get('/ready', async (_request, reply) => {
    const result = await container.httpHandlers.health.handle('ready');
    return reply.code(result.status === 'ok' ? 200 : 503).send(result);
  });

  app.get('/api/health', async (_request, reply) => {
    const result = await container.httpHandlers.health.handle('health');
    return reply.code(result.status === 'ok' ? 200 : 503).send(result);
  });
}
