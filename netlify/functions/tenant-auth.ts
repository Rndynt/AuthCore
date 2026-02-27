import { stream, type StreamingHandler } from "@netlify/functions";
import type { HandlerEvent, StreamingResponse } from "@netlify/functions";

import { getTenantAuth } from "../../src/multi-tenant/auth-factory.js";
import { tenantManager } from "../../src/multi-tenant/connection-manager.js";
import type { Tenant } from "../../src/multi-tenant/types.js";
import { trustedOrigins } from "../../src/env.js";

function normalizeOrigin(origin?: string): string | undefined {
  if (!origin) return undefined;
  try {
    const parsed = new URL(origin);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return origin;
  }
}

function allowOrigin(origin?: string): string {
  const normalized = normalizeOrigin(origin);
  if (normalized && trustedOrigins.includes(normalized)) {
    return normalized;
  }
  if (origin && trustedOrigins.includes(origin)) {
    return origin;
  }
  return trustedOrigins[0] ?? normalized ?? "*";
}

function getRequestUrl(event: HandlerEvent): URL {
  const url = new URL(event.rawUrl);

  const originalPath =
    event.headers["x-nf-original-path"] ??
    event.headers["x-nf-original-pathname"] ??
    event.headers["x-original-path"];

  if (originalPath) {
    url.pathname = originalPath;
  }

  const originalQuery = event.headers["x-nf-original-query"];
  if (originalQuery && originalQuery.length > 0) {
    url.search = originalQuery.startsWith("?") ? originalQuery : `?${originalQuery}`;
  }

  const functionPrefix = "/.netlify/functions/";
  if (url.pathname.startsWith(functionPrefix)) {
    const afterPrefix = url.pathname.slice(functionPrefix.length);
    const firstSlash = afterPrefix.indexOf("/");
    if (firstSlash !== -1) {
      const trimmed = afterPrefix.slice(firstSlash);
      url.pathname = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    }
  }

  return url;
}

function getClientIp(event: HandlerEvent): string | undefined {
  const forwarded = event.headers["x-forwarded-for"] ?? event.headers["client-ip"];
  if (forwarded) {
    return forwarded.split(",")[0]?.trim();
  }
  return event.headers["x-nf-client-connection-ip"];
}

async function responseToNetlifyResult(
  res: Response,
  origin?: string
): Promise<StreamingResponse> {
  const singleHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin(origin),
    "Access-Control-Allow-Credentials": "true"
  };

  const setCookies: string[] = [];

  res.headers.forEach((val, key) => {
    if (key.toLowerCase() === "set-cookie") {
      setCookies.push(val);
    } else {
      singleHeaders[key] = val;
    }
  });

  let body: string | ReadableStream<Uint8Array> | null = res.body;

  if (!body) {
    body = await res.text().catch(() => "");
  }

  return {
    statusCode: res.status,
    headers: singleHeaders,
    multiValueHeaders: setCookies.length ? { "Set-Cookie": setCookies } : undefined,
    body: body as any
  };
}

function handleCorsPreflight(origin?: string): StreamingResponse {
  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": allowOrigin(origin),
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Requested-With, x-api-key, X-Tenant-Id"
    },
    body: ""
  };
}

const TENANT_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;

let tenantManagerReady = false;
let tenantManagerInitPromise: Promise<void> | null = null;

async function initializeTenantManager(): Promise<void> {
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
  const hostname = 
    getHeaderValue(event, 'x-nf-original-host') ??
    getHeaderValue(event, 'x-forwarded-host') ??
    getHeaderValue(event, 'host');

  if (!hostname) {
    return null;
  }

  const parts = hostname.split('.');

  if (parts.length < 3) {
    return null;
  }

  const subdomain = parts[0].toLowerCase();

  if (['www', 'api', 'admin'].includes(subdomain)) {
    return null;
  }

  if (!TENANT_IDENTIFIER_PATTERN.test(subdomain)) {
    return null;
  }

  const tenant = tenantManager.resolveTenant(subdomain);
  if (!tenant) {
    return null;
  }

  return tenant.id.toLowerCase() === subdomain ? tenant.id : tenant.slug;
}

function extractTenantId(event: HandlerEvent): string | null {
  const headerTenantId = getHeaderValue(event, 'x-tenant-id');
  if (headerTenantId) {
    return headerTenantId;
  }

  const subdomain = extractSubdomain(event);
  if (subdomain) {
    return subdomain;
  }

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

function validateTenant(tenantId: string): { tenant: Tenant | null; error: string | null } {
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

interface TenantBootstrapResult {
  tenantId: string | null;
  tenant: Tenant | null;
  error: string | null;
}

async function bootstrapTenant(event: HandlerEvent): Promise<TenantBootstrapResult> {
  try {
    await initializeTenantManager();
  } catch (error) {
    console.error("[Tenant Bootstrap] Initialization failed:", error);
    return {
      tenantId: null,
      tenant: null,
      error: "Failed to initialize tenant manager"
    };
  }

  const tenantId = extractTenantId(event);
  if (!tenantId) {
    return {
      tenantId: null,
      tenant: null,
      error: "Tenant identifier required. Provide via X-Tenant-Id header, subdomain, or /tenant/{id} path"
    };
  }

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

/**
 * Tenant Authentication Function
 * Handles tenant-specific authentication routes:
 * - /api/auth/* - Tenant authentication
 * 
 * Uses tenant-specific schemas (NOT public schema)
 * Bootstraps tenant context from request (header, subdomain, or path)
 */
const baseHandler: StreamingHandler = async (event: HandlerEvent) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return handleCorsPreflight(event.headers.origin);
  }

  const url = getRequestUrl(event);
  const pathname = url.pathname;

  // Only handle tenant API routes
  if (!pathname.startsWith("/api/")) {
    return {
      statusCode: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Not Found" })
    };
  }

  // Bootstrap tenant context
  const { tenantId, tenant, error } = await bootstrapTenant(event);

  if (error || !tenantId || !tenant) {
    console.error(`[Tenant Auth] Bootstrap failed: ${error}`);
    return {
      statusCode: tenantId ? 404 : 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": event.headers.origin || "*",
        "Access-Control-Allow-Credentials": "true"
      },
      body: JSON.stringify({
        error: tenantId ? "TENANT_NOT_FOUND" : "TENANT_REQUIRED",
        message: error || "Tenant validation failed",
        tenantId: tenantId || undefined
      })
    };
  }

  console.log(`[Tenant Auth] Processing request for tenant: ${tenantId} (${tenant.name})`);

  // Get tenant-specific auth instance (async)
  let tenantAuth;
  try {
    tenantAuth = await getTenantAuth(tenantId);
  } catch (error) {
    console.error(`[Tenant Auth] Failed to get auth instance for tenant ${tenantId}:`, error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": event.headers.origin || "*",
        "Access-Control-Allow-Credentials": "true"
      },
      body: JSON.stringify({
        error: "TENANT_AUTH_ERROR",
        message: "Failed to initialize tenant authentication",
        tenantId
      })
    };
  }

  // Prepare request for Better Auth handler
  const headers = new Headers();
  for (const [k, v] of Object.entries(event.headers)) {
    if (v) headers.set(k, String(v));
  }

  const body = event.body
    ? (event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body)
    : undefined;

  // Forward to tenant-specific auth handler
  try {
    const res = await tenantAuth.handler(
      new Request(url.toString(), {
        method: event.httpMethod,
        headers,
        body
      })
    );

    return responseToNetlifyResult(res, event.headers.origin);
  } catch (error) {
    console.error(`[Tenant Auth] Handler error for tenant ${tenantId}:`, error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": event.headers.origin || "*",
        "Access-Control-Allow-Credentials": "true"
      },
      body: JSON.stringify({
        error: "INTERNAL_ERROR",
        message: "Authentication request failed",
        tenantId
      })
    };
  }
};

export const handler = stream(baseHandler);
