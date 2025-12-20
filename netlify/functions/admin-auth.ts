import { stream, type StreamingHandler } from "@netlify/functions";
import type { HandlerEvent, StreamingResponse } from "@netlify/functions";

import { adminAuth } from "../../src/admin/auth.js";
import { createAdminApiHandlers } from "../../src/admin/admin-api.js";
import { tenantService } from "../../src/application/tenant-service.js";
import { tenantManager } from "../../src/multi-tenant/connection-manager.js";
import { addLogListener, removeLogListener } from "../../src/utils/log-stream.js";
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

/**
 * Admin Authentication Function
 * Handles all admin-related routes:
 * - /admin/auth/* - Admin authentication (uses adminAuth instance)
 * - /admin/api/* - Admin API requests
 * - /admin/log-stream - Admin log streaming
 * 
 * Uses authcore_system schema (isolated from tenant schemas)
 */
const { handleAdminApiRequest, handleAdminLogStream } = createAdminApiHandlers({
  adminAuth,
  tenantService,
  tenantManager,
  addLogListener,
  removeLogListener
});

const baseHandler: StreamingHandler = async (event: HandlerEvent) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return handleCorsPreflight(event.headers.origin);
  }

  const url = getRequestUrl(event);
  const pathname = url.pathname;

  // Only handle admin routes
  if (!pathname.startsWith("/admin/")) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Not Found" })
    };
  }

  const headers = new Headers();
  for (const [k, v] of Object.entries(event.headers)) {
    if (v) headers.set(k, String(v));
  }

  const body = event.body
    ? (event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body)
    : undefined;

  const clientIp = getClientIp(event);

  // Handle admin log stream
  if (pathname === "/admin/log-stream") {
    const logResponse = await handleAdminLogStream(
      new Request(url.toString(), {
        method: event.httpMethod,
        headers,
        body
      }),
      { ip: clientIp }
    );

    if (logResponse) {
      return responseToNetlifyResult(logResponse, event.headers.origin);
    }
  }

  // Handle admin API requests
  if (pathname.startsWith("/admin/api")) {
    const adminResponse = await handleAdminApiRequest(
      new Request(url.toString(), {
        method: event.httpMethod,
        headers,
        body
      }),
      { ip: clientIp }
    );

    if (adminResponse) {
      return responseToNetlifyResult(adminResponse, event.headers.origin);
    }
  }

  // Handle admin authentication routes
  if (pathname.startsWith("/admin/auth")) {
    // Rewrite /admin/auth/* to /api/auth/* for Better Auth handler
    url.pathname = pathname.replace("/admin/auth", "/api/auth");

    const res = await adminAuth.handler(
      new Request(url.toString(), {
        method: event.httpMethod,
        headers,
        body
      })
    );

    return responseToNetlifyResult(res, event.headers.origin);
  }

  // Unknown admin route
  return {
    statusCode: 404,
    body: JSON.stringify({ error: "Admin route not found" })
  };
};

export const handler = stream(baseHandler);
