/**
 * Multi-Tenant Type Definitions
 */

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  schema_name: string;
  status: 'active' | 'suspended' | 'deleted';
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface Application {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  domain?: string;
  api_key?: string;
  allowed_origins: string[];
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface TenantAuditLog {
  id: number;
  tenant_id: string;
  action: string;
  actor?: string;
  details?: Record<string, any>;
  ip_address?: string;
  created_at: Date;
}

export interface TenantContext {
  tenantId: string;
  tenant: Tenant;
  schemaName: string;
}

export interface ProvisionTenantInput {
  tenantId: string;
  name: string;
  slug: string;
  metadata?: Record<string, any>;
}

export interface TenantRegistry {
  tenants: Map<string, Tenant>;
  slugToTenantId: Map<string, string>;
  schemaToTenantId: Map<string, string>;
}

export class TenantNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Tenant not found: ${identifier}`);
    this.name = 'TenantNotFoundError';
  }
}

export class TenantSuspendedError extends Error {
  constructor(tenantId: string) {
    super(`Tenant is suspended: ${tenantId}`);
    this.name = 'TenantSuspendedError';
  }
}

export class CrossTenantAccessError extends Error {
  constructor(requestedTenant: string, ownedTenant: string) {
    super(`Cross-tenant access forbidden: requested ${requestedTenant}, owned ${ownedTenant}`);
    this.name = 'CrossTenantAccessError';
  }
}
