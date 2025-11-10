/**
 * Tenant Middleware for Fastify
 * Extracts tenant identifier from request and adds to request context
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { tenantManager } from './connection-manager.js';

const TENANT_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;

export interface TenantRequest extends FastifyRequest {
  tenantId?: string;
  tenantSlug?: string;
}

/**
 * Extract tenant identifier from request
 * Priority: X-Tenant-Id header > subdomain > path
 */
function getHeaderValue(request: FastifyRequest, headerName: string): string | null {
  const headers = request.headers as Record<string, string | string[] | undefined>;
  const value = headers[headerName.toLowerCase()];

  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return null;
}

function extractTenantId(request: FastifyRequest): string | null {
  // 1. Check X-Tenant-Id header (highest priority)
  const headerTenantId = getHeaderValue(request, 'x-tenant-id');
  if (headerTenantId) {
    return headerTenantId;
  }

  // 2. Check subdomain (e.g., pos.auth.com -> pos)
  const hostname = request.hostname;
  const subdomain = extractSubdomain(hostname);
  if (subdomain) {
    return subdomain;
  }

  // 3. Check path (e.g., /tenant/pos/api/auth/...)
  const pathMatch = request.url.match(/^\/tenant\/([^\/]+)/);
  if (pathMatch) {
    return pathMatch[1];
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

function normalizeTenantIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  if (!TENANT_IDENTIFIER_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * Tenant middleware - requires tenant identification
 */
export async function tenantMiddleware(
  request: TenantRequest,
  reply: FastifyReply
) {
  const tenantIdentifier = extractTenantId(request);

  if (!tenantIdentifier) {
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

  const normalizedIdentifier = normalizeTenantIdentifier(tenantIdentifier);
  if (!normalizedIdentifier) {
    return reply.code(400).send({
      error: 'TENANT_INVALID',
      message: `Tenant identifier '${tenantIdentifier}' is not valid. Use lowercase letters, numbers, dashes, or underscores.`,
      tenant: tenantIdentifier
    });
  }

  // Check if tenant exists and is active
  const tenant = tenantManager.resolveTenant(normalizedIdentifier);
  if (!tenant) {
    return reply.code(404).send({
      error: 'TENANT_NOT_FOUND',
      message: `Tenant '${tenantIdentifier}' not found or inactive`,
      tenantId: tenantIdentifier
    });
  }

  if (tenant.status !== 'active') {
    return reply.code(403).send({
      error: 'TENANT_SUSPENDED',
      message: `Tenant '${tenant.id}' is ${tenant.status}`,
      tenantId: tenant.id,
      status: tenant.status
    });
  }

  // Attach tenant context to request
  request.tenantId = tenant.id;
  request.tenantSlug = tenant.slug;

  console.log(`[Tenant] Request from tenant: ${tenant.id} (${tenant.name})`);
}

/**
 * Optional tenant middleware - doesn't fail if no tenant
 */
export async function optionalTenantMiddleware(
  request: TenantRequest,
  reply: FastifyReply
) {
  const tenantIdentifier = extractTenantId(request);

  if (tenantIdentifier) {
    const normalizedIdentifier = normalizeTenantIdentifier(tenantIdentifier);
    if (!normalizedIdentifier) {
      return;
    }

    const tenant = tenantManager.resolveTenant(normalizedIdentifier);
    if (tenant && tenant.status === 'active') {
      request.tenantId = tenant.id;
      request.tenantSlug = tenant.slug;
      console.log(`[Tenant] Optional tenant context: ${tenant.id}`);
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
