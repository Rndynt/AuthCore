/**
 * tenantAuthFunction — Netlify handler for /api/auth/:tenantSlug/* traffic.
 *
 * Thin adapter: converts Netlify event → Web Request,
 * delegates to TenantAuthHandler (which resolves the tenant and forwards
 * to its scoped Better Auth instance), converts response back.
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { netlifyEventToWebRequest } from './netlify-request-mapper.js';
import { webResponseToNetlify } from './netlify-response-mapper.js';
import type { AppContainer } from '../../apps/api/src/container';

const TENANT_SLUG_RE = /^\/api\/auth\/([^/]+)/;

export function createTenantAuthFunction(container: AppContainer): Handler {
  return async (event: HandlerEvent, _context: HandlerContext) => {
    const match = TENANT_SLUG_RE.exec(event.path);
    if (!match?.[1]) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing tenant slug in path.' }) };
    }

    const tenantSlug = match[1];
    const webRequest = netlifyEventToWebRequest(event);

    try {
      const response = await container.httpHandlers.tenantAuth.handle(tenantSlug, webRequest);
      return webResponseToNetlify(response);
    } catch (err) {
      console.error('[tenantAuthFunction] Unhandled error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
  };
}
