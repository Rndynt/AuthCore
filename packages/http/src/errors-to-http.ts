import { AppError, toApiError } from '../../core/src/errors/app-error';
import { jsonResponse } from './http-response';
export function errorToHttp(error: unknown, requestId?: string): Response { const status = error instanceof AppError ? error.status : 500; return jsonResponse(toApiError(error, requestId), { status }); }
