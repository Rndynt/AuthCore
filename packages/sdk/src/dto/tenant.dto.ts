export interface TenantDto { id: string; name: string; slug: string; status: string; schemaName: string; metadata?: Record<string, unknown>; createdAt?: string; updatedAt?: string; }
export interface CreateTenantDto { id: string; name: string; slug: string; }
