import type { FastifyInstance } from 'fastify';
import type { AppContainer } from '../../../../apps/api/src/container.js';

/** Register /health, /ready, /healthz and /api/health endpoints. */
export async function registerHealthRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  const healthCheck = async (type: 'health' | 'ready', reply: any) => {
    const result = await container.httpHandlers.health.handle(type);
    return reply.code(result.status === 'ok' ? 200 : 503).send(result);
  };

  app.get('/health',     (_req, reply) => healthCheck('health', reply));
  app.get('/healthz',    (_req, reply) => healthCheck('health', reply));
  app.get('/ready',      (_req, reply) => healthCheck('ready',  reply));
  app.get('/api/health', (_req, reply) => healthCheck('health', reply));
}
