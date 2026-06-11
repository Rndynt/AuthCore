/**
 * Realmio API — Composition Root
 *
 * This is the only file allowed to touch environment variables directly.
 * It loads config, builds the container, creates the Fastify app and starts it.
 */

import { loadAppConfig } from './config.js';
import { createAppContainer } from './container.js';
import { createFastifyApp } from '../../../packages/server-fastify/src/create-fastify-app.js';

async function main() {
  const config = loadAppConfig();

  // 1. Initialise the tenant registry (loads all active tenants into memory)
  const container = await createAppContainer(config);
  await container.tenantRegistry.initialize();

  console.log(`[main] Tenant registry initialised.`);

  // 2. Build the Fastify server with the wired container
  const app = await createFastifyApp(container);

  // 3. Graceful shutdown hooks
  const shutdown = async (signal: string) => {
    console.log(`[main] ${signal} received — shutting down…`);
    await app.close();
    await container.connectionManager.shutdown();
    console.log('[main] Server closed.');
    process.exit(0);
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT',  () => void shutdown('SIGINT'));

  // 4. Start listening
  const host = config.host;
  const port = config.port;
  await app.listen({ host, port });
  console.log(`[main] Listening on http://${host}:${port}`);
}

main().catch(err => {
  console.error('[main] Fatal startup error:', err);
  process.exit(1);
});
