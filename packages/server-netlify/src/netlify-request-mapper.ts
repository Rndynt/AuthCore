import type { HandlerEvent } from '@netlify/functions';

/**
 * Convert a Netlify HandlerEvent into a standard Web Fetch API Request.
 */
export function netlifyEventToWebRequest(event: HandlerEvent): Request {
  // IMPORTANT: `event.rawUrl` from @netlify/functions is ALREADY an absolute
  // URL (e.g. "https://example.com/admin/auth/sign-in/email"). Previously this
  // was prefixed with `${scheme}://${host}` again, producing a malformed,
  // double-prefixed URL such as:
  //   https://example.comhttps://example.com/admin/auth/sign-in/email
  // `new Request(...)` does not throw on this (the WHATWG URL parser is
  // lenient), so it silently produced a Request whose `.url` / pathname no
  // longer matched any real route. Downstream routers (better-auth's basePath
  // matching, etc.) would then fail to match the request without ever
  // throwing - so nothing was logged, and the client-side fetch would just
  // hang or get an unexplained 404, matching the "signing in forever, no
  // error anywhere" symptom.
  const scheme = event.headers?.['x-forwarded-proto'] ?? 'https';
  const host   = event.headers?.host ?? 'localhost';
  const fallbackQuery = event.rawQuery ? `?${event.rawQuery}` : '';
  const url = event.rawUrl || `${scheme}://${host}${event.path}${fallbackQuery}`;

  const headers = new Headers(
    Object.fromEntries(
      Object.entries(event.headers ?? {}).map(([k, v]) => [k, v ?? '']),
    ) as Record<string, string>,
  );

  const method  = event.httpMethod.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const bodyRaw = hasBody ? event.body : undefined;

  const body =
    bodyRaw != null
      ? event.isBase64Encoded
        ? Buffer.from(bodyRaw, 'base64')
        : bodyRaw
      : undefined;

  return new Request(url, { method, headers, body: body as BodyInit | null });
}
