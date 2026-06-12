import type { Handler, HandlerEvent, HandlerContext, HandlerResponse } from '@netlify/functions';
import { loadAppConfig } from '../../apps/api/src/config.js';
import { createAppContainer } from '../../apps/api/src/container.js';
import { createAdminAuthFunction } from '../../packages/server-netlify/src/admin-auth-function.js';

let _handler: Handler | undefined;

async function getHandler(): Promise<Handler> {
  if (_handler) return _handler;
  const config = loadAppConfig();
  const container = await createAppContainer(config);
  await container.tenantRegistry.initialize();
  _handler = createAdminAuthFunction(container);
  return _handler;
}

export const handler: Handler = (event: HandlerEvent, context: HandlerContext) =>
  getHandler().then(fn => {
    const result = fn(event, context);
    return (result instanceof Promise ? result : Promise.resolve(result ?? { statusCode: 200, body: '' })) as Promise<HandlerResponse>;
  });
