export interface HealthResult {
  status: 'ok' | 'degraded' | 'error';
  mode?: string;
  timestamp: string;
  features?: unknown;
  connections?: unknown;
}

export class HealthHandler {
  constructor(
    private readonly deps: {
      mode: string;
      features: unknown;
      connectionHealth?: () => unknown;
    },
  ) {}

  async handle(type: 'health' | 'ready' = 'health'): Promise<HealthResult> {
    const connections = this.deps.connectionHealth?.();
    const status: 'ok' | 'degraded' =
      type === 'ready' && connections != null
        ? ((connections as any)?.healthy === false ? 'degraded' : 'ok')
        : 'ok';

    return {
      status,
      mode: this.deps.mode,
      timestamp: new Date().toISOString(),
      features: this.deps.features,
      ...(type === 'ready' ? { connections } : {}),
    };
  }
}
