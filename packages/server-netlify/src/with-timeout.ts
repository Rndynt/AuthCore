/**
 * Race a promise against a timeout so that a hung dependency (DB connect,
 * Prisma engine start-up, etc.) fails fast with a clear, logged error instead
 * of hanging silently until Netlify/Lambda's hard execution-timeout kills the
 * whole invocation without ever writing another log line.
 */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`[timeout] ${label} did not complete within ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}
