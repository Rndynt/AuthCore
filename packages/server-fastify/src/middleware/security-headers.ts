import type { FastifyInstance } from 'fastify';

/** Attach security-related HTTP headers to every response. */
export function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook('onSend', (_request, reply, _payload, done) => {
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Frame-Options', 'DENY')
      .header('X-XSS-Protection', '1; mode=block')
      .header('Referrer-Policy', 'strict-origin-when-cross-origin')
      .header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    done();
  });
}
