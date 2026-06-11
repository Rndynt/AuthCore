import type { FastifyInstance } from 'fastify';
import type { CheckIpBlockedUseCase } from '../../../core/src/application/security/security-use-cases';

/**
 * Register an IP-blocking hook.
 * Calls CheckIpBlockedUseCase before every request and returns 403 if blocked.
 */
export function registerIpBlocking(
  app: FastifyInstance,
  checkIpBlocked: CheckIpBlockedUseCase,
): void {
  app.addHook('onRequest', async (request, reply) => {
    const ip =
      (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      request.ip ||
      '127.0.0.1';

    try {
      const result = await checkIpBlocked.execute(ip);
      if (result.blocked) {
        await reply
          .code(403)
          .header('Content-Type', 'application/json')
          .send(JSON.stringify({
            error: 'FORBIDDEN',
            message: 'Your IP address has been blocked.',
            ip,
          }));
      }
    } catch {
      // Never fail a request due to a blocklist error
    }
  });
}
