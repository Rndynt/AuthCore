/**
 * Tenant Middleware for Fastify
 * Extracts tenant identifier from request and adds to request context
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { tenantManager } from './connection-manager.js';

export interface TenantRequest extends FastifyRequest {
  tenantId?: string;
  tenantSlug?: string;
}

/**
 * Extract tenant identifier from request
 * Priority: X-Tenant-Id header > subdomain > path
 */
function extractTenantId(request: FastifyRequest): string | null {
  // 1. Check X-Tenant-Id header (highest priority)
  const headerTenantId = request.headers['x-tenant-id'] as string;
  if (headerTenantId) {
    return headerTenantId.toLowerCase();
  }

  // 2. Check subdomain (e.g., pos.auth.com -> pos)
  const hostname = request.hostname;
  const subdomain = extractSubdomain(hostname);
  if (subdomain && ['pos', 'ticket', 'crypto'].includes(subdomain)) {
    return subdomain;
  }

  // 3. Check path (e.g., /tenant/pos/api/auth/...)
  const pathMatch = request.url.match(/^\/tenant\/([^\/]+)/);
  if (pathMatch) {
    return pathMatch[1].toLowerCase();
  }

  return null;
}

function extractSubdomain(hostname: string): string | null {
  const parts = hostname.split('.');
  
  if (parts.length >= 3) {
    const subdomain = parts[0];
    if (!['www', 'api', 'admin'].includes(subdomain)) {
      return subdomain;
    }
  }
  
  return null;
}

/**
 * Tenant middleware - requires tenant identification
 */
export async function tenantMiddleware(
  request: TenantRequest,
  reply: FastifyReply
) {
  const tenantId = extractTenantId(request);

  if (!tenantId) {
    return reply.code(400).send({
      error: 'TENANT_REQUIRED',
      message: 'Tenant identifier required. Provide via X-Tenant-Id header, subdomain, or /tenant/{id} path',
      examples: {
        header: 'X-Tenant-Id: pos',
        subdomain: 'pos.your-auth-domain.com',
        path: '/tenant/pos/api/auth/...'
      }
    });
  }

  // Check if tenant exists and is active
  const tenant = tenantManager.getTenant(tenantId);
  if (!tenant) {
    return reply.code(404).send({
      error: 'TENANT_NOT_FOUND',
      message: `Tenant '${tenantId}' not found or inactive`,
      tenantId
    });
  }

  if (tenant.status !== 'active') {
    return reply.code(403).send({
      error: 'TENANT_SUSPENDED',
      message: `Tenant '${tenantId}' is ${tenant.status}`,
      tenantId,
      status: tenant.status
    });
  }

  // Attach tenant context to request
  request.tenantId = tenantId;
  request.tenantSlug = tenant.slug;

  console.log(`[Tenant] Request from tenant: ${tenantId} (${tenant.name})`);
}

/**
 * Optional tenant middleware - doesn't fail if no tenant
 */
export async function optionalTenantMiddleware(
  request: TenantRequest,
  reply: FastifyReply
) {
  const tenantId = extractTenantId(request);

  if (tenantId) {
    const tenant = tenantManager.getTenant(tenantId);
    if (tenant && tenant.status === 'active') {
      request.tenantId = tenantId;
      request.tenantSlug = tenant.slug;
      console.log(`[Tenant] Optional tenant context: ${tenantId}`);
    }
  }
}

/**
 * Get tenant-specific Prisma client from request
 */
export function getTenantClient(request: TenantRequest) {
  if (!request.tenantId) {
    throw new Error('Tenant ID not found in request. Did you apply tenant middleware?');
  }

  return tenantManager.getClient(request.tenantId);
}
