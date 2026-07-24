import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { netlifyEventToWebRequest } from './netlify-request-mapper.js';
import { webResponseToNetlify } from './netlify-response-mapper.js';
import { withTimeout } from './with-timeout.js';
import type { AppContainer } from '../../../apps/api/src/container.js';

const TENANT_PATH_RE = /^\/tenant\/([^/]+)/;
const AUTH_CALL_TIMEOUT_MS = 8000;

export function createTenantAuthFunction(container: AppContainer): Handler {
  return async (event: HandlerEvent, _context: HandlerContext) => {
    const start = Date.now();
    const webRequest = netlifyEventToWebRequest(event);
    console.log(`[tenantAuthFunction] --> ${event.httpMethod} ${event.path} (mapped url=${webRequest.url})`);

    // Determine whether the request has an explicit /tenant/:id prefix
    const pathMatch = TENANT_PATH_RE.exec(event.path);
    const options = pathMatch?.[1]
      ? { pathTenantId: pathMatch[1], stripTenantPrefix: true }
      : undefined;

    try {
      const response = await withTimeout(
        container.httpHandlers.tenantAuth.handle(webRequest, options),
        AUTH_CALL_TIMEOUT_MS,
        'httpHandlers.tenantAuth.handle',
      );
      const result = await webResponseToNetlify(response);
      console.log(`[tenantAuthFunction] <-- ${event.httpMethod} ${event.path} ${result.statusCode} (${Date.now() - start}ms)`);
      return result;
    } catch (err) {
      console.error(`[tenantAuthFunction] xx  ${event.httpMethod} ${event.path} threw after ${Date.now() - start}ms:`, err);
      const message = err instanceof Error ? err.message : String(err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error', message }) };
    }
  };
}
