import { stream, type StreamingHandler } from "@netlify/functions";
import type { HandlerEvent } from "@netlify/functions";

import { getTenantAuth } from "../../src/multi-tenant/auth-factory.js";
import { bootstrapTenant } from "../helpers/tenant-bootstrap.js";
import {
  getRequestUrl,
  getClientIp,
  responseToNetlifyResult,
  handleCorsPreflight
} from "../helpers/common.js";

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

  // Get tenant-specific auth instance
  let tenantAuth;
  try {
    tenantAuth = getTenantAuth(tenantId);
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
