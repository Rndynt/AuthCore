import type { FastifyInstance } from 'fastify';
import type { AppContainer } from '../../../../apps/api/src/container.js';

/**
 * Register all tenant auth routes, preserving full API compatibility:
 *
 *   /api/auth/*                          — primary path, tenant resolved from header/subdomain
 *   /tenant/:tenantId/api/auth/*         — explicit tenant path prefix
 *   /legacy/auth/*                       — deprecated; forwarded with deprecation headers
 */
export async function registerTenantAuthRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  const { tenantAuth } = container.httpHandlers;

  // ---- Primary: /api/auth/* ------------------------------------------------
  // Tenant resolved from X-Tenant-Id header, subdomain, or path.
  app.all('/api/auth/*', async (request, reply) => {
    const webRequest = fastifyToWebRequest(request);
    const response = await tenantAuth.handle(webRequest);
    await webResponseToFastify(response, reply);
  });

  // ---- Explicit tenant prefix: /tenant/:tenantId/api/auth/* ----------------
  app.all('/tenant/:tenantId/api/auth/*', async (request, reply) => {
    const tenantId = (request.params as any).tenantId as string;
    const webRequest = fastifyToWebRequest(request);
    const response = await tenantAuth.handle(webRequest, {
      pathTenantId: tenantId,
      stripTenantPrefix: true,
    });
    await webResponseToFastify(response, reply);
  });

  // ---- Legacy: /legacy/auth/* (deprecated) ---------------------------------
  app.all('/legacy/auth/*', async (request, reply) => {
    const webRequest = fastifyToWebRequest(request);
    const response = await tenantAuth.handle(webRequest);
    // Attach deprecation header without mutating the original Response
    const body = await response.text();
    reply
      .code(response.status)
      .header('Deprecation', 'true')
      .header('Sunset', 'Sat, 01 Jan 2026 00:00:00 GMT')
      .header('Link', '</api/auth>; rel="successor-version"');
    response.headers.forEach((value: string, key: string) => {
      if (key.toLowerCase() !== 'content-length') reply.header(key, value);
    });
    await reply.send(body || null);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fastifyToWebRequest(request: any): Request {
  const url = `${request.protocol}://${request.hostname}${request.url}`;
  const headers = new Headers(request.headers as Record<string, string>);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return new Request(url, {
    method: request.method,
    headers,
    body: hasBody ? (request.rawBody ?? JSON.stringify(request.body)) : undefined,
  });
}

async function webResponseToFastify(response: Response, reply: any): Promise<void> {
  reply.code(response.status);
  response.headers.forEach((value: string, key: string) => {
    if (key.toLowerCase() !== 'content-length') reply.header(key, value);
  });
  const body = await response.text();
  await reply.send(body || null);
}
