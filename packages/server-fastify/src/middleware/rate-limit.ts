import type { FastifyInstance } from 'fastify';

/** Basic in-process sliding-window rate limiter (per IP). */
export function registerRateLimit(
  app: FastifyInstance,
  options: { max?: number; windowMs?: number } = {},
): void {
  const max = options.max ?? 200;
  const windowMs = options.windowMs ?? 60_000;
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Periodic cleanup to avoid unbounded memory growth
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs * 2);
  cleanup.unref();

  app.addHook('onRequest', async (request, reply) => {
    const ip =
      (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      request.ip ||
      'unknown';

    const now = Date.now();
    let entry = hits.get(ip);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 1, resetAt: now + windowMs };
      hits.set(ip, entry);
    } else {
      entry.count += 1;
    }

    reply.header('X-RateLimit-Limit', String(max));
    reply.header('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    reply.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      await reply
        .code(429)
        .header('Content-Type', 'application/json')
        .send(JSON.stringify({ error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' }));
    }
  });
}
