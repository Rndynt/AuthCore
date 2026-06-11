import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

/** Attach a unique X-Request-ID to every request/response. */
export function registerRequestId(app: FastifyInstance): void {
  app.addHook('onRequest', (request, reply, done) => {
    const id = (request.headers['x-request-id'] as string) || randomUUID();
    request.id = id;
    reply.header('x-request-id', id);
    done();
  });
}
