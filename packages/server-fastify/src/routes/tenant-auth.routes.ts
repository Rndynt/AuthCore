import type { FastifyInstance } from 'fastify';
import type { AppContainer } from '../../../apps/api/src/container';

/**
 * Register all /api/auth/:tenantSlug/* routes.
 * Resolves the tenant from the slug and forwards to its Better Auth instance.
 */
export async function registerTenantAuthRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  const { tenantAuth } = container.httpHandlers;

  app.all('/api/auth/:tenantSlug/*', async (request, reply) => {
    const slug = (request.params as any).tenantSlug as string;
    const webRequest = fastifyToWebRequest(request);
    const response = await tenantAuth.handle(slug, webRequest);
    await webResponseToFastify(response, reply);
  });

  // Also handle /api/auth/:tenantSlug (without trailing wildcard)
  app.all('/api/auth/:tenantSlug', async (request, reply) => {
    const slug = (request.params as any).tenantSlug as string;
    const webRequest = fastifyToWebRequest(request);
    const response = await tenantAuth.handle(slug, webRequest);
    await webResponseToFastify(response, reply);
  });
}

function fastifyToWebRequest(request: any): Request {
  const url = `${request.protocol}://${request.hostname}${request.url}`;
  const headers = new Headers(request.headers as Record<string, string>);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return new Request(url, {
    method: request.method,
    headers,
    body: hasBody ? JSON.stringify(request.body) : undefined,
  });
}

async function webResponseToFastify(response: Response, reply: any): Promise<void> {
  reply.code(response.status);
  response.headers.forEach((value, key) => reply.header(key, value));
  const body = await response.text();
  await reply.send(body || null);
}
