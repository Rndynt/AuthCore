export class RealmioApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'RealmioApiError';
  }
}
