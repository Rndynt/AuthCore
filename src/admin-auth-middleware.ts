/**
 * Admin Authentication Middleware
 * Protects admin endpoints with API key authentication
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from './env.js';

export async function adminAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Check if admin API key is configured
  if (!env.ADMIN_API_KEY) {
    return reply.code(503).send({
      error: 'ADMIN_ENDPOINTS_DISABLED',
      message: 'Admin endpoints are disabled. Set ADMIN_API_KEY environment variable to enable.'
    });
  }

  // Extract API key from header
  const providedKey = 
    request.headers['x-admin-api-key'] as string ||
    request.headers['authorization']?.replace('Bearer ', '');

  if (!providedKey) {
    return reply.code(401).send({
      error: 'UNAUTHORIZED',
      message: 'Admin API key required. Provide via X-Admin-API-Key header or Authorization: Bearer {key}'
    });
  }

  // Verify API key matches
  if (providedKey !== env.ADMIN_API_KEY) {
    return reply.code(403).send({
      error: 'FORBIDDEN',
      message: 'Invalid admin API key'
    });
  }

  // API key valid - allow access
  console.log('[Admin] Authenticated admin request');
}
