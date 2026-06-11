import { TenantValidationError } from '../../errors/tenant-errors';

const TENANT_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const SCHEMA_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

export function normalizeTenantIdentifier(value: unknown, label = 'tenant'): string {
  if (typeof value !== 'string') throw new TenantValidationError(`${label} must be a string`);
  const trimmed = value.trim().toLowerCase();
  if (!TENANT_IDENTIFIER_PATTERN.test(trimmed)) {
    throw new TenantValidationError(`${label} must start with a letter/number and contain only lowercase letters, numbers, dashes, or underscores`);
  }
  return trimmed;
}

export function buildTenantSchemaName(tenantId: string): string {
  const normalized = normalizeTenantIdentifier(tenantId, 'tenant id').replace(/-/g, '_');
  return `tenant_${normalized}`;
}

export function validateSchemaName(schemaName: unknown): string {
  if (typeof schemaName !== 'string') throw new TenantValidationError('schema name must be a string');
  const trimmed = schemaName.trim().toLowerCase();
  if (!SCHEMA_PATTERN.test(trimmed)) throw new TenantValidationError('schema name must be a valid PostgreSQL identifier');
  return trimmed;
}
