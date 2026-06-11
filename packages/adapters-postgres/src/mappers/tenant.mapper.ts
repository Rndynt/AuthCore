import type { Tenant } from '../../../core/src/domain/tenant/tenant';

export interface TenantRow { id: string; name: string; slug: string; schema_name: string; status: Tenant['status']; metadata?: Record<string, unknown> | null; created_at: Date; updated_at: Date; }

export function tenantRowToDomain(row: TenantRow): Tenant {
  return { id: row.id, name: row.name, slug: row.slug, schemaName: row.schema_name, status: row.status, metadata: row.metadata ?? {}, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function tenantDomainToLegacy(domain: Tenant) {
  return { id: domain.id, name: domain.name, slug: domain.slug, schema_name: domain.schemaName, status: domain.status, metadata: domain.metadata, created_at: domain.createdAt, updated_at: domain.updatedAt };
}
