/**
 * Netlify Function: tenant-auth
 *
 * Entry point only. All logic lives in packages/server-netlify.
 * Bootstraps the container once (cold start) and reuses it for warm invocations.
 */

import type { Handler } from '@netlify/functions';
import { loadAppConfig } from '../../apps/api/src/config.js';
import { createAppContainer } from '../../apps/api/src/container.js';
import { createTenantAuthFunction } from '../../packages/server-netlify/src/tenant-auth-function.js';

let handler: Handler | undefined;

async function getHandler(): Promise<Handler> {
  if (handler) return handler;

  const config = loadAppConfig();
  const container = await createAppContainer(config);
  await container.tenantRegistry.initialize();

  handler = createTenantAuthFunction(container);
  return handler;
}

export const handler: Handler = async (event, context) => {
  const fn = await getHandler();
  return fn(event, context);
};
