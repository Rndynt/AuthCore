/**
 * adminAuthFunction — Netlify handler for all /admin/* traffic.
 *
 * Thin adapter: converts Netlify event → Web Request,
 * delegates to AdminApiHandler / BetterAuth admin handler,
 * converts Web Response → Netlify response.
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { netlifyEventToWebRequest } from './netlify-request-mapper.js';
import { webResponseToNetlify } from './netlify-response-mapper.js';
import type { AppContainer } from '../../apps/api/src/container';

export function createAdminAuthFunction(container: AppContainer): Handler {
  return async (event: HandlerEvent, _context: HandlerContext) => {
    const webRequest = netlifyEventToWebRequest(event);
    const path = event.path;
    const ip = event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || event.headers?.['client-ip'];

    try {
      // 1. Better Auth admin routes (/admin/auth/*)
      if (path.startsWith('/admin/auth')) {
        const response = await container.authProviders.admin.handler(webRequest);
        return webResponseToNetlify(response);
      }

      // 2. Admin API routes (/admin/api/*)
      if (path.startsWith('/admin/api')) {
        const response = await container.httpHandlers.adminApi.handleAdminApiRequest(webRequest, { ip });
        if (response) return webResponseToNetlify(response);
      }

      // 3. Log stream (/admin/log-stream)
      if (path === '/admin/log-stream') {
        // SSE is not supported in serverless — return 501
        return { statusCode: 501, body: JSON.stringify({ error: 'LOG_STREAM_NOT_SUPPORTED', message: 'Log streaming is not available in serverless mode.' }) };
      }

      return { statusCode: 404, body: JSON.stringify({ error: 'Not Found' }) };
    } catch (err) {
      console.error('[adminAuthFunction] Unhandled error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
  };
}
