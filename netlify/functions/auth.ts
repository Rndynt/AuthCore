import type { Handler, HandlerEvent } from "@netlify/functions";
import { auth } from "../../src/auth.js";
import { adminAuth } from "../../src/admin/auth.js";
import { trustedOrigins } from "../../src/env.js";

const normalizeOrigin = (origin?: string) => {
  if (!origin) return undefined;
  try {
    const parsed = new URL(origin);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return origin;
  }
};

const allowOrigin = (origin?: string) => {
  const normalized = normalizeOrigin(origin);
  if (normalized && trustedOrigins.includes(normalized)) {
    return normalized;
  }
  if (origin && trustedOrigins.includes(origin)) {
    return origin;
  }
  return trustedOrigins[0] ?? normalized ?? "*";
};

/**
 * Netlify rewrites (status = 200) strip the original pathname when a request is
 * proxied to a function. The original value is forwarded via `x-nf-original-*`
 * headers, so we need to stitch it back together before handing the request to
 * Better Auth. Without this, the handler only sees `/.netlify/functions/auth`
 * and fails to route `/admin/auth/*` or `/api/auth/*` requests.
 */
function getRequestUrl(event: HandlerEvent) {
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

  return url;
}

const pickAuthInstance = (url: URL) => {
  const pathname = url.pathname;
  if (pathname.startsWith("/admin/auth")) {
    return adminAuth;
  }
  return auth;
};

/**
 * Netlify rewrites (status = 200) strip the original pathname when a request is
 * proxied to a function. The original value is forwarded via `x-nf-original-*`
 * headers, so we need to stitch it back together before handing the request to
 * Better Auth. Without this, the handler only sees `/.netlify/functions/auth`
 * and fails to route `/admin/auth/*` or `/api/auth/*` requests.
 */
function getRequestUrl(event: HandlerEvent) {
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

  return url;
}

export const handler: Handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": allowOrigin(event.headers.origin),
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Requested-With, x-api-key, X-Tenant-Id"
      },
      body: ""
    };
  }

  const url = getRequestUrl(event);
  const authInstance = pickAuthInstance(url);
  const headers = new Headers();
  for (const [k, v] of Object.entries(event.headers)) if (v) headers.set(k, String(v));

  const body = event.body
    ? (event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body)
    : undefined;

  const res = await authInstance.handler(new Request(url.toString(), {
    method: event.httpMethod,
    headers,
    body
  }));

  const singleHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin(event.headers.origin),
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

  const text = await res.text().catch(() => "");
  return {
    statusCode: res.status,
    headers: singleHeaders,
    multiValueHeaders: setCookies.length ? { "Set-Cookie": setCookies } : undefined,
    body: text
  };
};