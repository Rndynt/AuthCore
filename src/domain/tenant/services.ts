import { TenantValidationError } from './errors.js';

const TENANT_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;

/**
 * Allowed characters for schema name (PostgreSQL safe)
 * Only alphanumeric and underscore allowed in schema names
 */
const SCHEMA_SAFE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;
const MAX_SCHEMA_NAME_LENGTH = 63;

export function normalizeTenantIdentifier(value: string, field: 'id' | 'slug'): string {
  const normalized = value.trim().toLowerCase();

  if (!TENANT_IDENTIFIER_PATTERN.test(normalized)) {
    throw new TenantValidationError(
      `Invalid tenant ${field}. Use lowercase letters, numbers, dashes, or underscores (1-63 characters).`
    );
  }

  return normalized;
}

/**
 * Build a PostgreSQL-safe schema name from tenant ID
 * 
 * SECURITY (Poin 5): Strict validation to prevent SQL injection
 * - Only allows alphanumeric and underscore
 * - Must start with letter
 * - Max 63 characters (PostgreSQL limit)
 * - Prefix with 'tenant_' to avoid reserved words
 */
export function buildTenantSchemaName(tenantId: string): string {
  // First normalize the tenant ID
  const normalizedId = tenantId.trim().toLowerCase();
  
  // Validate format
  if (!TENANT_IDENTIFIER_PATTERN.test(normalizedId)) {
    throw new TenantValidationError(
      `Invalid tenant ID format for schema: ${tenantId}`
    );
  }
  
  // Replace hyphens with underscores (PostgreSQL schema names can't have hyphens)
  const schemaSuffix = normalizedId.replace(/-/g, '_');
  
  // Build full schema name
  const schemaName = `tenant_${schemaSuffix}`;
  
  // Validate final schema name
  if (!SCHEMA_SAFE_PATTERN.test(schemaName)) {
    throw new TenantValidationError(
      `Invalid schema name generated: ${schemaName}. Schema names must start with letter and contain only alphanumeric and underscore.`
    );
  }
  
  // Check length (PostgreSQL limit is 63 characters)
  if (schemaName.length > MAX_SCHEMA_NAME_LENGTH) {
    throw new TenantValidationError(
      `Schema name too long: ${schemaName.length} characters. Maximum is ${MAX_SCHEMA_NAME_LENGTH}.`
    );
  }
  
  // Additional check: ensure no SQL injection attempts
  // Reject any schema name containing suspicious patterns
  const suspiciousPatterns = [
    /--/,           // SQL comment
    /\/\*/,         // Block comment start
    /\*\//,         // Block comment end
    /;/,            // Statement terminator
    /'/,            // Single quote
    /"/,            // Double quote
    /\\/,           // Backslash
    /\$\$/,         // Dollar quoting
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(schemaName)) {
      throw new TenantValidationError(
        `Schema name contains invalid characters`
      );
    }
  }
  
  return schemaName;
}

/**
 * Validate an existing schema name is safe to use in queries
 */
export function validateSchemaName(schemaName: string): boolean {
  return SCHEMA_SAFE_PATTERN.test(schemaName) && 
         schemaName.length <= MAX_SCHEMA_NAME_LENGTH;
}