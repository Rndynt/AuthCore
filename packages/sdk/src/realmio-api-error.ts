export class RealmioApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'RealmioApiError';
  }
}
