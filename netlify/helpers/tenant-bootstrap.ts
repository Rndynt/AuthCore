import type { HandlerEvent } from "@netlify/functions";
import { tenantManager } from "../../src/multi-tenant/connection-manager.js";
import type { Tenant } from "../../src/multi-tenant/types.js";

const TENANT_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;

let tenantManagerReady = false;
let tenantManagerInitPromise: Promise<void> | null = null;

/**
 * Initialize tenant manager (singleton with cold start handling)
 */
export async function initializeTenantManager(): Promise<void> {
  if (tenantManagerReady) {
    return;
  }

  if (!tenantManagerInitPromise) {
    tenantManagerInitPromise = tenantManager.initialize()
      .then(() => {
        tenantManagerReady = true;
        console.log("[Tenant Bootstrap] Tenant manager initialized");
      })
      .catch((error) => {
        tenantManagerInitPromise = null;
        console.error("[Tenant Bootstrap] Failed to initialize tenant manager:", error);
        throw error;
      });
  }

  await tenantManagerInitPromise;
}

function getHeaderValue(event: HandlerEvent, headerName: string): string | null {
  const value = event.headers[headerName.toLowerCase()];
  
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

function extractSubdomain(event: HandlerEvent): string | null {
  // Check Netlify-specific headers first (x-nf-original-host takes priority)
  const hostname = 
    getHeaderValue(event, 'x-nf-original-host') ??
    getHeaderValue(event, 'x-forwarded-host') ??
    getHeaderValue(event, 'host');

  if (!hostname) {
    return null;
  }

  const parts = hostname.split('.');

  // Need at least subdomain.domain.tld
  if (parts.length < 3) {
    return null;
  }

  const subdomain = parts[0].toLowerCase();

  // Exclude common subdomains that aren't tenants
  if (['www', 'api', 'admin'].includes(subdomain)) {
    return null;
  }

  // Validate pattern
  if (!TENANT_IDENTIFIER_PATTERN.test(subdomain)) {
    return null;
  }

  // Check if this subdomain maps to a tenant
  const tenant = tenantManager.resolveTenant(subdomain);
  if (!tenant) {
    return null;
  }

  // Return tenant ID or slug
  return tenant.id.toLowerCase() === subdomain ? tenant.id : tenant.slug;
}

/**
 * Extract tenant identifier from request
 * Priority: X-Tenant-Id header → subdomain → path
 */
export function extractTenantId(event: HandlerEvent): string | null {
  // 1. Check X-Tenant-Id header (highest priority)
  const headerTenantId = getHeaderValue(event, 'x-tenant-id');
  if (headerTenantId) {
    return headerTenantId;
  }

  // 2. Check subdomain (using Netlify headers)
  const subdomain = extractSubdomain(event);
  if (subdomain) {
    return subdomain;
  }

  // 3. Check path (e.g., /tenant/pos/api/auth/...)
  // Need to get original path from Netlify headers
  const originalPath =
    getHeaderValue(event, 'x-nf-original-path') ??
    getHeaderValue(event, 'x-nf-original-pathname') ??
    getHeaderValue(event, 'x-original-path');

  const pathToCheck = originalPath || new URL(event.rawUrl).pathname;
  const pathMatch = pathToCheck.match(/^\/tenant\/([^\/]+)/);
  if (pathMatch) {
    return pathMatch[1];
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
 * Validate tenant exists and is active
 */
export function validateTenant(tenantId: string): { tenant: Tenant | null; error: string | null } {
  const normalizedIdentifier = normalizeTenantIdentifier(tenantId);
  if (!normalizedIdentifier) {
    return {
      tenant: null,
      error: `Tenant identifier '${tenantId}' is not valid. Use lowercase letters, numbers, dashes, or underscores.`
    };
  }

  const tenant = tenantManager.resolveTenant(normalizedIdentifier);
  if (!tenant) {
    return {
      tenant: null,
      error: `Tenant '${tenantId}' not found or inactive`
    };
  }

  if (tenant.status !== 'active') {
    return {
      tenant: null,
      error: `Tenant '${tenant.id}' is ${tenant.status}`
    };
  }

  return { tenant, error: null };
}

export interface TenantBootstrapResult {
  tenantId: string | null;
  tenant: Tenant | null;
  error: string | null;
}

/**
 * Bootstrap tenant context for a Netlify function request
 * Combines initialization, extraction, and validation
 */
export async function bootstrapTenant(event: HandlerEvent): Promise<TenantBootstrapResult> {
  try {
    // Ensure tenant manager is initialized (handles cold starts)
    await initializeTenantManager();
  } catch (error) {
    console.error("[Tenant Bootstrap] Initialization failed:", error);
    return {
      tenantId: null,
      tenant: null,
      error: "Failed to initialize tenant manager"
    };
  }

  // Extract tenant identifier from request
  const tenantId = extractTenantId(event);
  if (!tenantId) {
    return {
      tenantId: null,
      tenant: null,
      error: "Tenant identifier required. Provide via X-Tenant-Id header, subdomain, or /tenant/{id} path"
    };
  }

  // Validate tenant
  const { tenant, error } = validateTenant(tenantId);
  if (error || !tenant) {
    return {
      tenantId,
      tenant: null,
      error: error || "Tenant validation failed"
    };
  }

  console.log(`[Tenant Bootstrap] Successfully bootstrapped tenant: ${tenant.id} (${tenant.name})`);
  
  return {
    tenantId: tenant.id,
    tenant,
    error: null
  };
}
