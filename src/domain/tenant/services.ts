import { TenantValidationError } from './errors.js';

const TENANT_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;

export function normalizeTenantIdentifier(value: string, field: 'id' | 'slug'): string {
  const normalized = value.trim().toLowerCase();

  if (!TENANT_IDENTIFIER_PATTERN.test(normalized)) {
    throw new TenantValidationError(
      `Invalid tenant ${field}. Use lowercase letters, numbers, dashes, or underscores (1-63 characters).`
    );
  }

  return normalized;
}

export function buildTenantSchemaName(tenantId: string): string {
  const schemaSuffix = tenantId.replace(/-/g, '_');
  return `tenant_${schemaSuffix}`;
}
