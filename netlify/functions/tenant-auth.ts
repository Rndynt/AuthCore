import type { Handler, HandlerEvent, HandlerContext, HandlerResponse } from '@netlify/functions';
import { loadAppConfig } from '../../apps/api/src/config.js';
import { createAppContainer } from '../../apps/api/src/container.js';
import { createTenantAuthFunction } from '../../packages/server-netlify/src/tenant-auth-function.js';
import { withTimeout } from '../../packages/server-netlify/src/with-timeout.js';

let _handler: Handler | undefined;
let _initError: Error | undefined;
let _initPromise: Promise<Handler> | undefined;

const INIT_TIMEOUT_MS = 8000;

async function getHandler(): Promise<Handler> {
  if (_handler) return _handler;
  if (_initError) throw _initError;
  if (!_initPromise) {
    _initPromise = (async () => {
      const initStart = Date.now();
      console.log('[tenant-auth] cold start: initializing container...');
      const config = loadAppConfig();
      const container = await withTimeout(createAppContainer(config), INIT_TIMEOUT_MS, 'createAppContainer');
      await withTimeout(container.tenantRegistry.initialize(), INIT_TIMEOUT_MS, 'tenantRegistry.initialize');
      console.log(`[tenant-auth] container ready in ${Date.now() - initStart}ms`);
      return createTenantAuthFunction(container);
    })();
  }
  try {
    _handler = await _initPromise;
    return _handler;
  } catch (err) {
    _initError = err instanceof Error ? err : new Error(String(err));
    _initPromise = undefined;
    throw _initError;
  }
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext): Promise<HandlerResponse> => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  try {
    const fn = await getHandler();
    const result = fn(event, context);
    return (result instanceof Promise ? result : Promise.resolve(result ?? { statusCode: 200, body: '' })) as Promise<HandlerResponse>;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[tenant-auth] Handler initialization error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'INITIALIZATION_ERROR', message }),
    };
  }
};
