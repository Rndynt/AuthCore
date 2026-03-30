/**
 * Validation Schemas for Admin API
 *
 * IMPROVEMENTS (Poin 9):
 * - Zod validation for all admin API inputs
 * - Type-safe request validation
 * - Comprehensive validation rules
 */

import { z } from 'zod';
import { ValidationError } from './errors.js';

/**
 * Tenant validation schemas
 */
export const tenantIdSchema = z.string()
  .min(1, 'Tenant ID is required')
  .max(63, 'Tenant ID must be at most 63 characters')
  .regex(/^[a-z0-9][a-z0-9_-]{0,62}$/, 'Tenant ID must start with alphanumeric and contain only lowercase letters, numbers, dashes, or underscores');

export const tenantNameSchema = z.string()
  .min(1, 'Tenant name is required')
  .max(255, 'Tenant name must be at most 255 characters');

export const tenantSlugSchema = z.string()
  .min(1, 'Tenant slug is required')
  .max(63, 'Tenant slug must be at most 63 characters')
  .regex(/^[a-z0-9][a-z0-9_-]{0,62}$/, 'Slug must start with alphanumeric and contain only lowercase letters, numbers, dashes, or underscores');

export const createTenantSchema = z.object({
  id: tenantIdSchema,
  name: tenantNameSchema,
  slug: tenantSlugSchema,
  metadata: z.record(z.unknown()).optional(),
});

export const updateTenantSchema = z.object({
  name: tenantNameSchema.optional(),
  slug: tenantSlugSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * User validation schemas
 */
export const userIdSchema = z.string()
  .min(1, 'User ID is required');

export const userEmailSchema = z.string()
  .email('Invalid email format');

export const userSearchSchema = z.object({
  q: z.string().max(255).optional(),
  tenantId: tenantIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Session validation schemas
 */
export const sessionMinutesSchema = z.number()
  .int('Minutes must be an integer')
  .min(1, 'Minimum session duration is 1 minute')
  .max(1440, 'Maximum session duration is 24 hours (1440 minutes)');

export const createSupportSessionSchema = z.object({
  userId: userIdSchema,
  minutes: sessionMinutesSchema.optional().default(30),
});

/**
 * API Key validation schemas
 */
export const apiKeyLabelSchema = z.string()
  .min(1, 'API key label is required')
  .max(100, 'API key label must be at most 100 characters');

export const expiresInDaysSchema = z.number()
  .int('Days must be an integer')
  .min(1, 'Minimum expiry is 1 day')
  .max(365, 'Maximum expiry is 365 days');

export const createApiKeySchema = z.object({
  label: apiKeyLabelSchema,
  expiresInDays: expiresInDaysSchema.optional(),
  userId: userIdSchema.optional(),
});

/**
 * Organization validation schemas
 */
export const orgIdSchema = z.string()
  .min(1, 'Organization ID is required');

export const orgNameSchema = z.string()
  .min(1, 'Organization name is required')
  .max(255, 'Organization name must be at most 255 characters');

export const orgRoleSchema = z.enum(['owner', 'admin', 'member'], {
  errorMap: () => ({ message: 'Role must be one of: owner, admin, member' }),
});

export const createOrganizationSchema = z.object({
  name: orgNameSchema,
  slug: z.string().max(63).regex(/^[a-z0-9-]+$/).optional(),
});

export const updateOrganizationSchema = z.object({
  name: orgNameSchema.optional(),
  slug: z.string().max(63).regex(/^[a-z0-9-]+$/).optional(),
});

export const addMemberSchema = z.object({
  userId: userIdSchema,
  role: orgRoleSchema,
});

export const createInvitationSchema = z.object({
  email: userEmailSchema,
  role: orgRoleSchema.optional().default('member'),
});

/**
 * Security settings validation schemas
 */
export const securitySettingsSchema = z.object({
  trustedOrigins: z.array(z.string().url()).optional(),
  enableDevEndpoints: z.boolean().optional(),
  apiKeyRotationDays: z.number().int().min(0).max(365).nullable().optional(),
  adminIpAllowlist: z.array(z.string()).optional(),
  enforceAdminMfa: z.boolean().optional(),
  readOnlyMode: z.boolean().optional(),
});

/**
 * Audit log query schema
 */
export const auditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  action: z.string().max(100).optional(),
  targetType: z.string().max(100).optional(),
  targetId: z.string().max(255).optional(),
  adminUserId: z.string().max(255).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().max(255).optional(),
  tenantStatus: z.enum(['active', 'suspended', 'deleted', 'provisioning', 'failed']).optional(),
});

/**
 * Connection prune schema
 */
export const pruneConnectionsSchema = z.object({
  force: z.boolean().optional().default(false),
});

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Helper function to validate input
 * Throws ValidationError (AppError subclass) for proper error handling
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  errorMessage = 'Validation failed'
): T {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    const fieldErrors = result.error.errors.reduce((acc, e) => {
      const path = e.path.join('.') || 'root';
      acc[path] = e.message;
      return acc;
    }, {} as Record<string, string>);
    
    const errorSummary = Object.entries(fieldErrors)
      .map(([field, msg]) => `${field}: ${msg}`)
      .join(', ');
    
    throw new ValidationError(`${errorMessage}: ${errorSummary}`, { fields: fieldErrors });
  }
  
  return result.data;
}

/**
 * Safe parse that returns null instead of throwing
 */
export function safeParseInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    const errors = result.error.errors.reduce((acc, e) => {
      const path = e.path.join('.') || 'root';
      acc[path] = e.message;
      return acc;
    }, {} as Record<string, string>);
    
    return { success: false, errors };
  }
  
  return { success: true, data: result.data };
}

/**
 * Type exports
 */
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type UserSearchInput = z.infer<typeof userSearchSchema>;
export type CreateSupportSessionInput = z.infer<typeof createSupportSessionSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type SecuritySettingsInput = z.infer<typeof securitySettingsSchema>;
export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>;
export type PruneConnectionsInput = z.infer<typeof pruneConnectionsSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
