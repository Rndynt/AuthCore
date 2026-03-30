import type { FastifyRequest } from 'fastify';

function extractHeaderValue(value?: string | string[]): string | undefined {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value[0];
  }

  return value.split(',')[0]?.trim();
}

export function getRequestOrigin(request: FastifyRequest): string {
  const forwardedProto = extractHeaderValue(request.headers['x-forwarded-proto']);
  const protocol = forwardedProto || request.protocol || 'http';

  const forwardedHost = extractHeaderValue(request.headers['x-forwarded-host']);
  const host = forwardedHost || request.headers.host || request.hostname;

  return `${protocol}://${host}`;
}
