import type { FastifyInstance } from 'fastify';
import type { AppContainer } from '../../../../apps/api/src/container.js';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Route-guard helper (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Returns true only for paths where Fastify should serve the Admin UI
 * (static file or SPA index fallback).
 *
 * Exclusions:
 *   /api/*          — tenant auth / health
 *   /admin/api      — Admin API root (no wildcard suffix)
 *   /admin/api/*    — Admin API routes
 *   /admin/auth/*   — Better Auth admin routes
 *   /admin/log-stream — SSE
 *   /tenant/*       — explicit tenant auth
 *   /legacy/*       — deprecated auth compatibility
 *   /dev/*          — development endpoints
 *   /health         — health check
 *   /healthz        — health check alias
 *   /ready          — readiness probe
 *   /api/health     — health API
 */
export function shouldServeAdminUi(pathname: string): boolean {
  // Normalise: drop trailing slash unless it IS the root
  const p = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;

  // Root is served as a redirect to /admin (documented below)
  if (p === '/') return true;

  // Bare /admin
  if (p === '/admin') return true;

  // Anything under /admin/*
  if (!p.startsWith('/admin/')) return false;

  const rest = p.slice('/admin/'.length); // e.g. 'settings', 'api/tenants', 'auth/…'

  if (rest === 'api' || rest.startsWith('api/')) return false;
  if (rest === 'auth' || rest.startsWith('auth/')) return false;
  if (rest === 'log-stream') return false;

  return true;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

const MISSING_JSON = {
  error: 'STATIC_UI_NOT_BUILT',
  message:
    'Admin UI static files not found at dist/public. ' +
    'Run `npm run build:admin-ui` and rebuild the Docker image.',
};

export async function registerStaticUiRoutes(
  app: FastifyInstance,
  container: AppContainer,
  fastifyStatic: any,
): Promise<void> {
  const distPath = join(process.cwd(), 'dist', 'public');
  const isDev    = container.config.nodeEnv !== 'production';
  const hasFiles = existsSync(distPath) && existsSync(join(distPath, 'index.html'));

  if (!hasFiles) {
    if (isDev) {
      // Development placeholder — helps confirm the route works without a full build
      app.get('/', async (_req, reply) => reply.redirect('/admin', 302));
      app.get('/admin', async (_req, reply) =>
        reply.code(200 as number).header('Content-Type', 'text/html').send(
          '<html><body><h1>Realmio Admin</h1><p>Run <code>npm run build:admin-ui</code> to see the Admin UI.</p></body></html>',
        ),
      );
    } else {
      // Production: hard error — do NOT silently serve placeholder
      const errorReply = async (_req: any, reply: any) =>
        reply.code(500 as number).send(MISSING_JSON);
      app.get('/',        errorReply);
      app.get('/admin',   errorReply);
      app.get('/admin/*', errorReply);
    }
    return;
  }

  // ── Static files served from dist/public at /admin prefix ────────────────
  // @fastify/static with wildcard:false decorates reply with sendFile().
  await app.register(fastifyStatic, {
    root: distPath,
    prefix: '/admin',
    wildcard: false,
    decorateReply: true,
  });

  // Root → redirect to /admin (documented: we redirect rather than serve)
  app.get('/', async (_req, reply) => reply.redirect('/admin/', 302));

  // /admin bare (no trailing slash) → SPA index
  app.get('/admin', async (_req, reply) => (reply as any).sendFile('index.html'));

  // /admin/* — serve exact static file OR SPA fallback
  app.get('/admin/*', async (request, reply) => {
    const wildcard = (request.params as any)['*'] as string;
    const fullPath  = `/admin/${wildcard}`;

    if (!shouldServeAdminUi(fullPath)) {
      return reply.code(404 as number).send({ error: 'NOT_FOUND', message: 'Route not found.' });
    }

    // Try exact file match first (JS/CSS/images/fonts/etc.)
    const filePath = join(distPath, wildcard);
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      return (reply as any).sendFile(wildcard);
    }

    // Directory index (trailingSlash pages)
    const indexPath = join(distPath, wildcard, 'index.html');
    if (existsSync(indexPath)) {
      return (reply as any).sendFile(join(wildcard, 'index.html'));
    }

    // SPA fallback — let the client-side router take over
    return (reply as any).sendFile('index.html');
  });
}
