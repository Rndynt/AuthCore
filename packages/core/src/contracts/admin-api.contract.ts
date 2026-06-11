export type AdminApiErrorCode = 'TENANT_REQUIRED' | 'TENANT_INVALID' | 'TENANT_NOT_FOUND' | 'TENANT_SUSPENDED' | 'UNAUTHORIZED' | 'VALIDATION_ERROR' | 'INVALID_JSON' | 'INTERNAL_ERROR';
export interface AdminApiError { error: AdminApiErrorCode | string; message: string; details?: unknown; requestId?: string; }
