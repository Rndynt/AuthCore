import { stream, type StreamingHandler } from "@netlify/functions";
import type { HandlerEvent } from "@netlify/functions";

import { adminAuth } from "../../src/admin/auth.js";
import { handleAdminApiRequest, handleAdminLogStream } from "../../src/admin/api-handler.js";
import {
  getRequestUrl,
  getClientIp,
  responseToNetlifyResult,
  handleCorsPreflight
} from "../helpers/common.js";

/**
 * Admin Authentication Function
 * Handles all admin-related routes:
 * - /admin/auth/* - Admin authentication (uses adminAuth instance)
 * - /admin/api/* - Admin API requests
 * - /admin/log-stream - Admin log streaming
 * 
 * Uses authcore_system schema (isolated from tenant schemas)
 */
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
