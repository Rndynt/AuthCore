export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toApiError(error: unknown, requestId?: string) {
  if (error instanceof AppError) {
    return { error: error.code, message: error.message, details: error.details, requestId };
  }
  return { error: 'INTERNAL_ERROR', message: 'Internal server error', requestId };
}
