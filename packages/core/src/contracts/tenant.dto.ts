import type { TenantStatus } from '../domain/tenant/tenant';
export interface TenantDto { id: string; name: string; slug: string; schemaName: string; status: TenantStatus; metadata: Record<string, unknown>; createdAt: string; updatedAt: string; }
export interface CreateTenantDto { id: string; name: string; slug: string; }
