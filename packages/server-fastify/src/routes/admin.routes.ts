import type { FastifyInstance } from 'fastify';
import type { AppContainer } from '../../../apps/api/src/container';

/**
 * Register all /admin/* routes.
 * Delegates to AdminApiHandler for request routing and auth checks.
 */
export async function registerAdminRoutes(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  const { handleAdminApiRequest, handleAdminLogStream } = container.httpHandlers.adminApi;

  // All Better Auth admin routes (login, session, etc.)
  app.all('/admin/auth/*', async (request, reply) => {
    const webRequest = fastifyToWebRequest(request);
    const response = await container.authProviders.admin.handler(webRequest);
    await webResponseToFastify(response, reply);
  });

  // Admin API routes
  app.all('/admin/api/*', async (request, reply) => {
    const webRequest = fastifyToWebRequest(request);
    const ip = getClientIp(request);
    const response = await handleAdminApiRequest(webRequest, { ip });
    if (!response) return reply.code(404).send({ error: 'Not Found' });
    await webResponseToFastify(response, reply);
  });

  // Log stream (SSE)
  app.get('/admin/log-stream', async (request, reply) => {
    const webRequest = fastifyToWebRequest(request);
    const ip = getClientIp(request);
    const response = await handleAdminLogStream(webRequest, { ip });
    if (!response) return reply.code(404).send({ error: 'Not Found' });
    await webResponseToFastify(response, reply);
  });
}

// ---------------------------------------------------------------------------
// Helpers — Fastify ↔ Web Fetch API bridging
// ---------------------------------------------------------------------------

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

function getClientIp(request: any): string {
  return (
    (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    request.ip ||
    '127.0.0.1'
  );
}
