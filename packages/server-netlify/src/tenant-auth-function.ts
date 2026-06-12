import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { netlifyEventToWebRequest } from './netlify-request-mapper.js';
import { webResponseToNetlify } from './netlify-response-mapper.js';
import type { AppContainer } from '../../../apps/api/src/container.js';

const TENANT_PATH_RE = /^\/tenant\/([^/]+)/;

export function createTenantAuthFunction(container: AppContainer): Handler {
  return async (event: HandlerEvent, _context: HandlerContext) => {
    const webRequest = netlifyEventToWebRequest(event);

    // Determine whether the request has an explicit /tenant/:id prefix
    const pathMatch = TENANT_PATH_RE.exec(event.path);
    const options = pathMatch?.[1]
      ? { pathTenantId: pathMatch[1], stripTenantPrefix: true }
      : undefined;

    try {
      const response = await container.httpHandlers.tenantAuth.handle(webRequest, options);
      return webResponseToNetlify(response);
    } catch (err) {
      console.error('[tenantAuthFunction] Unhandled error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
  };
}
