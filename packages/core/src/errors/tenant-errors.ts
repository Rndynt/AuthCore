import { AppError } from './app-error';

export class TenantValidationError extends AppError {
  constructor(message: string, details?: unknown) { super('VALIDATION_ERROR', message, 400, details); }
}
export class TenantNotFoundError extends AppError {
  constructor(tenantId: string) { super('TENANT_NOT_FOUND', `Tenant '${tenantId}' not found`, 404, { tenantId }); }
}
export class TenantSuspendedError extends AppError {
  constructor(tenantId: string, status = 'suspended') { super('TENANT_SUSPENDED', `Tenant '${tenantId}' is ${status}`, 403, { tenantId, status }); }
}
