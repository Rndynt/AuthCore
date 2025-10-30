/**
 * Admin Session Middleware
 * Validates admin sessions from authcore_system schema
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { adminAuth } from './auth.js';

/**
 * Convert Fastify headers to Web Headers
 */
function toHeaders(headers: any): Headers {
  const webHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value) {
      webHeaders.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
  }
  return webHeaders;
}

/**
 * Admin session middleware
 * Ensures request is authenticated as admin user
 */
export async function adminSessionMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const headers = toHeaders(request.headers);
    const session = await adminAuth.api.getSession({ headers } as any);
    
    if (!session || !session.user) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Admin authentication required. Please login.'
      });
    }
    
    // Attach admin user to request
    (request as any).adminUser = session.user;
    (request as any).adminSession = session.session;
    
    console.log(`[Admin] Authenticated: ${session.user.email}`);
    
  } catch (error) {
    console.error('[Admin] Session validation error:', error);
    return reply.code(401).send({
      error: 'UNAUTHORIZED',
      message: 'Invalid or expired admin session'
    });
  }
}

/**
 * Role-based authorization middleware
 * Requires specific admin role
 */
export function requireAdminRole(allowedRoles: string[] = ['admin']) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const adminUser = (request as any).adminUser;
    
    if (!adminUser) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Admin authentication required'
      });
    }
    
    if (!allowedRoles.includes(adminUser.role || '')) {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'Insufficient permissions',
        required: allowedRoles,
        actual: adminUser.role
      });
    }
  };
}

/**
 * Extended request type with admin user
 */
export interface AdminRequest extends FastifyRequest {
  adminUser?: {
    id: string;
    email: string;
    name: string | null;
    role: string | null;
  };
  adminSession?: any;
}
