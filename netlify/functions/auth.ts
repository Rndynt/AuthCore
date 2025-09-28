import type { Handler } from "@netlify/functions";
import { auth } from "../../src/auth.js";
import { trustedOrigins } from "../../src/env.js";

const allowOrigin = (origin?: string) => {
  if (!origin) return trustedOrigins[0] ?? "*";
  return trustedOrigins.includes(origin) ? origin : trustedOrigins[0] ?? "*";
};

export const handler: Handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": allowOrigin(event.headers.origin),
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, x-api-key"
      },
      body: ""
    };
  }

  const url = new URL(event.rawUrl);
  const headers = new Headers();
  for (const [k, v] of Object.entries(event.headers)) if (v) headers.set(k, String(v));

  const body = event.body
    ? (event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body)
    : undefined;

  const res = await auth.handler(new Request(url.toString(), {
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