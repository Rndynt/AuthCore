import type { FastifyInstance } from 'fastify';
import type { AppContainer } from '../../../../apps/api/src/container.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Register static-file serving for the Admin UI SPA.
 * Must NOT intercept /api/*, /admin/api/*, /tenant/*, /legacy/*, /dev/*, /health*.
 */
export async function registerStaticUiRoutes(
  app: FastifyInstance,
  _container: AppContainer,
  fastifyStatic: any,
): Promise<void> {
  const distPath = join(process.cwd(), 'dist', 'public');

  if (!existsSync(distPath)) {
    app.get('/admin', async (_req, reply) =>
      reply
        .code(200)
        .header('Content-Type', 'text/html')
        .send('<html><body><h1>Realmio Admin</h1><p>Static build not found.</p></body></html>'),
    );
    return;
  }

  await app.register(fastifyStatic, {
    root: distPath,
    prefix: '/',
    wildcard: false,
    decorateReply: false,
  });

  // SPA catch-all only for /admin/* paths that are not API routes
  app.get('/admin/*', async (req, reply) => {
    const path = (req.params as any)['*'] as string;
    // Do not intercept API sub-paths (belt-and-suspenders)
    if (path?.startsWith('api/') || path?.startsWith('auth/')) {
      return reply.code(404).send({ error: 'Not Found' });
    }
    return reply.sendFile('index.html');
  });
}
