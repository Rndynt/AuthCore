import type { HandlerEvent } from '@netlify/functions';

/**
 * Convert a Netlify HandlerEvent into a standard Web Fetch API Request.
 */
export function netlifyEventToWebRequest(event: HandlerEvent): Request {
  const scheme = event.headers?.['x-forwarded-proto'] ?? 'https';
  const host   = event.headers?.host ?? 'localhost';
  const url    = `${scheme}://${host}${event.rawUrl ?? event.path}`;

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
