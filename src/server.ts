/**
 * LEGACY COMPATIBILITY WRAPPER
 *
 * This file was the original monolithic entry point. It is now a thin shim
 * that delegates to the new composition root in apps/api/src/main.ts.
 *
 * It is intentionally kept as a valid module so that any legacy imports
 * (e.g., from packages/server-fastify stubs, Replit run config, etc.)
 * continue to work without changes.
 *
 * DO NOT add new business logic here.
 * All application logic lives in:
 *   packages/core            — domain + use cases
 *   packages/adapters-*      — port implementations
 *   packages/server-fastify  — HTTP server factory
 *   apps/api/src             — composition root
 */

// Re-export the composition root so callers can await the server start
export { loadAppConfig } from '../apps/api/src/config.js';
export { createAppContainer } from '../apps/api/src/container.js';
export { createFastifyApp } from '../packages/server-fastify/src/create-fastify-app.js';
