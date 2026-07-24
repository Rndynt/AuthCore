/**
 * adminAuthFunction — Netlify handler for all /admin/* traffic.
 *
 * Thin adapter: converts Netlify event → Web Request,
 * delegates to AdminApiHandler / BetterAuth admin handler,
 * converts Web Response → Netlify response.
 */

import type { Handler, HandlerEvent, HandlerContext, HandlerResponse } from '@netlify/functions';
import { netlifyEventToWebRequest } from './netlify-request-mapper.js';
import { webResponseToNetlify } from './netlify-response-mapper.js';
import { withTimeout } from './with-timeout.js';
import type { AppContainer } from '../../../apps/api/src/container.js';

// Netlify's own hard function timeout is 10s (free/starter) or 26s (pro+).
// We time out a bit earlier than that so we can return/log a clear error
// instead of letting Netlify kill the invocation silently.
const AUTH_CALL_TIMEOUT_MS = 8000;

export function createAdminAuthFunction(container: AppContainer): Handler {
  return async (event: HandlerEvent, _context: HandlerContext) => {
    const start = Date.now();
    const webRequest = netlifyEventToWebRequest(event);
    const path = event.path;
    const ip = event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || event.headers?.['client-ip'];

    // Always log the inbound request up front, before anything else can hang.
    console.log(`[adminAuthFunction] --> ${event.httpMethod} ${path} (mapped url=${webRequest.url})`);

    const respond = (result: HandlerResponse) => {
      console.log(`[adminAuthFunction] <-- ${event.httpMethod} ${path} ${result.statusCode} (${Date.now() - start}ms)`);
      return result;
    };

    try {
      // 1. Better Auth admin routes (/admin/auth/*)
      if (path.startsWith('/admin/auth')) {
        const response = await withTimeout(
          container.authProviders.admin.handler(webRequest),
          AUTH_CALL_TIMEOUT_MS,
          'admin.authProviders.admin.handler',
        );
        return respond(await webResponseToNetlify(response));
      }

      // 2. Admin API routes (/admin/api/*)
      if (path.startsWith('/admin/api')) {
        const response = await withTimeout(
          container.httpHandlers.adminApi.handleAdminApiRequest(webRequest, { ip }),
          AUTH_CALL_TIMEOUT_MS,
          'httpHandlers.adminApi.handleAdminApiRequest',
        );
        if (response) return respond(await webResponseToNetlify(response));
      }

      // 3. Log stream (/admin/log-stream)
      if (path === '/admin/log-stream') {
        // SSE is not supported in serverless — return 501
        return respond({ statusCode: 501, body: JSON.stringify({ error: 'LOG_STREAM_NOT_SUPPORTED', message: 'Log streaming is not available in serverless mode.' }) });
      }

      return respond({ statusCode: 404, body: JSON.stringify({ error: 'Not Found' }) });
    } catch (err) {
      console.error(`[adminAuthFunction] xx  ${event.httpMethod} ${path} threw after ${Date.now() - start}ms:`, err);
      const message = err instanceof Error ? err.message : String(err);
      return respond({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error', message }) });
    }
  };
}
