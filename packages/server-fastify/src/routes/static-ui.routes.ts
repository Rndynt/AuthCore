import type { FastifyInstance } from 'fastify';
import type { AppContainer } from '../../../apps/api/src/container';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Register static-file serving for the Admin UI (SPA).
 * In production, Vite builds are served from the dist/ folder.
 * Falls back to a minimal placeholder when no build is present.
 */
export async function registerStaticUiRoutes(
  app: FastifyInstance,
  _container: AppContainer,
): Promise<void> {
  const distPath = join(process.cwd(), 'dist', 'public');

  if (!existsSync(distPath)) {
    // No SPA build present — serve a minimal placeholder for /admin
    app.get('/admin', async (_req, reply) => {
      return reply
        .code(200)
        .header('Content-Type', 'text/html')
        .send('<html><body><h1>Realmio Admin</h1><p>Static build not found.</p></body></html>');
    });
    return;
  }

  // Serve static assets from dist/public
  await app.register(import('@fastify/static' as any), {
    root: distPath,
    prefix: '/',
    wildcard: false,
  });

  // SPA catch-all — serve index.html for any /admin/* path not matched above
  app.get('/admin/*', async (_req, reply) => {
    return reply.sendFile('index.html');
  });
}
