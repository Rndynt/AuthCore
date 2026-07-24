import type { Handler, HandlerEvent, HandlerContext, HandlerResponse } from '@netlify/functions';
import { loadAppConfig } from '../../apps/api/src/config.js';
import { createAppContainer } from '../../apps/api/src/container.js';
import { createTenantAuthFunction } from '../../packages/server-netlify/src/tenant-auth-function.js';

let _handler: Handler | undefined;
let _initError: Error | undefined;

async function getHandler(): Promise<Handler> {
  if (_handler) return _handler;
  if (_initError) throw _initError;
  try {
    const config = loadAppConfig();
    const container = await createAppContainer(config);
    await container.tenantRegistry.initialize();
    _handler = createTenantAuthFunction(container);
    return _handler;
  } catch (err) {
    _initError = err instanceof Error ? err : new Error(String(err));
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
