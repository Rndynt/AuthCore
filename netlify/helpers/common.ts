import type { HandlerEvent, StreamingResponse } from "@netlify/functions";
import { trustedOrigins } from "../../src/env.js";

export function normalizeOrigin(origin?: string): string | undefined {
  if (!origin) return undefined;
  try {
    const parsed = new URL(origin);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return origin;
  }
}

export function allowOrigin(origin?: string): string {
  const normalized = normalizeOrigin(origin);
  if (normalized && trustedOrigins.includes(normalized)) {
    return normalized;
  }
  if (origin && trustedOrigins.includes(origin)) {
    return origin;
  }
  return trustedOrigins[0] ?? normalized ?? "*";
}

export function getRequestUrl(event: HandlerEvent): URL {
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

export function getClientIp(event: HandlerEvent): string | undefined {
  const forwarded = event.headers["x-forwarded-for"] ?? event.headers["client-ip"];
  if (forwarded) {
    return forwarded.split(",")[0]?.trim();
  }
  return event.headers["x-nf-client-connection-ip"];
}

export async function responseToNetlifyResult(
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

export function handleCorsPreflight(origin?: string): StreamingResponse {
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
