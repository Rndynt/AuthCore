/**
 * Centralized Error Handling
 * 
 * Custom Error classes untuk consistent error handling di seluruh aplikasi.
 * 
 * IMPROVEMENTS (Poin 4):
 * - Structured error responses
 * - Proper stack trace preservation
 * - Error categorization
 * - Consistent error codes
 */

import type { FastifyReply } from 'fastify';

/**
 * Base Application Error
 */
export abstract class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    isOperational: boolean = true,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
    
    // Capture stack trace (excluding constructor call from it)
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON response format
   */
  toJSON(): Record<string, unknown> {
    const response: Record<string, unknown> = {
      error: this.code,
      message: this.message,
    };

    if (this.details) {
      response.details = this.details;
    }

    if (process.env.NODE_ENV !== 'production') {
      response.stack = this.stack;
    }

    return response;
  }
}

/**
 * Authentication Error (401)
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', details?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_ERROR', 401, true, details);
  }
}

/**
 * Authorization Error (403)
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', details?: Record<string, unknown>) {
    super(message, 'AUTHORIZATION_ERROR', 403, true, details);
  }
}

/**
 * Not Found Error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string, details?: Record<string, unknown>) {
    const message = identifier 
      ? `${resource} '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, true, details);
  }
}

/**
 * Validation Error (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, true, details);
  }
}

/**
 * Conflict Error (409)
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, true, details);
  }
}

/**
 * Rate Limit Error (429)
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests', details?: Record<string, unknown>) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, true, details);
  }
}

/**
 * Internal Server Error (500)
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', details?: Record<string, unknown>) {
    super(message, 'INTERNAL_ERROR', 500, false, details);
  }
}

/**
 * Service Unavailable Error (503)
 */
export class ServiceUnavailableError extends AppError {
  constructor(service: string, details?: Record<string, unknown>) {
    super(`${service} is temporarily unavailable`, 'SERVICE_UNAVAILABLE', 503, true, details);
  }
}

/**
 * Tenant Errors
 */
export class TenantError extends AppError {
  constructor(
    message: string,
    code: string,
    statusCode: number = 400,
    details?: Record<string, unknown>
  ) {
    super(message, code, statusCode, true, details);
  }
}

export class TenantNotFoundError extends TenantError {
  constructor(tenantId: string) {
    super(`Tenant '${tenantId}' not found`, 'TENANT_NOT_FOUND', 404, { tenantId });
  }
}

export class TenantSuspendedError extends TenantError {
  constructor(tenantId: string, status: string = 'suspended') {
    super(`Tenant '${tenantId}' is ${status}`, 'TENANT_SUSPENDED', 403, { tenantId, status });
  }
}

export class TenantValidationError extends TenantError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TENANT_VALIDATION_ERROR', 400, details);
  }
}

/**
 * Auth Errors (specific to authentication)
 */
export class AuthError extends AppError {
  constructor(
    message: string,
    code: string,
    statusCode: number = 401,
    details?: Record<string, unknown>
  ) {
    super(message, code, statusCode, true, details);
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor() {
    super('Invalid email or password', 'INVALID_CREDENTIALS', 401);
  }
}

export class SessionExpiredError extends AuthError {
  constructor() {
    super('Session has expired', 'SESSION_EXPIRED', 401);
  }
}

export class TokenInvalidError extends AuthError {
  constructor(tokenType: string = 'token') {
    super(`Invalid ${tokenType}`, 'TOKEN_INVALID', 401);
  }
}

/**
 * Admin Errors
 */
export class AdminError extends AppError {
  constructor(
    message: string,
    code: string,
    statusCode: number = 403,
    details?: Record<string, unknown>
  ) {
    super(message, code, statusCode, true, details);
  }
}

export class AdminNotFoundError extends AdminError {
  constructor() {
    super('Admin account not found', 'ADMIN_NOT_FOUND', 404);
  }
}

export class AdminAccessRequiredError extends AdminError {
  constructor() {
    super('Admin access required', 'ADMIN_ACCESS_REQUIRED', 403);
  }
}

/**
 * Organization Errors
 */
export class OrganizationError extends AppError {
  constructor(
    message: string,
    code: string,
    statusCode: number = 400,
    details?: Record<string, unknown>
  ) {
    super(message, code, statusCode, true, details);
  }
}

export class OrganizationNotFoundError extends OrganizationError {
  constructor(orgId: string) {
    super(`Organization '${orgId}' not found`, 'ORGANIZATION_NOT_FOUND', 404, { orgId });
  }
}

export class MembershipRequiredError extends OrganizationError {
  constructor(orgId: string, requiredRoles?: string[]) {
    super(
      'You are not a member of this organization',
      'MEMBERSHIP_REQUIRED',
      403,
      { orgId, requiredRoles }
    );
  }
}

export class InsufficientRoleError extends OrganizationError {
  constructor(orgId: string, requiredRoles: string[], currentRole?: string) {
    super(
      'Insufficient permissions for this organization',
      'INSUFFICIENT_ROLE',
      403,
      { orgId, requiredRoles, currentRole }
    );
  }
}

/**
 * Error Handler Helper
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function handleErrorResponse(error: unknown, reply: FastifyReply): void {
  if (isAppError(error)) {
    const response = error.toJSON();
    
    // Log operational errors as warn, non-operational as error
    if (error.isOperational) {
      console.warn(`[${error.code}] ${error.message}`, error.details || '');
    } else {
      console.error(`[${error.code}] ${error.message}`, {
        stack: error.stack,
        details: error.details
      });
    }

    reply.status(error.statusCode).send(response);
    return;
  }

  // Handle unknown errors
  console.error('[UNKNOWN_ERROR] An unexpected error occurred:', error);
  
  reply.status(500).send({
    error: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : error instanceof Error ? error.message : String(error),
  });
}

/**
 * Create error from status code and message (for backward compatibility)
 */
export function createError(status: number, message: string, code?: string): AppError {
  const errorCode = code || getDefaultCode(status);
  
  switch (status) {
    case 400:
      return new ValidationError(message);
    case 401:
      return new AuthenticationError(message);
    case 403:
      return new AuthorizationError(message);
    case 404:
      return new NotFoundError('Resource');
    case 409:
      return new ConflictError(message);
    case 429:
      return new RateLimitError(message);
    case 503:
      return new ServiceUnavailableError(message);
    default:
      return new InternalServerError(message);
  }
}

function getDefaultCode(status: number): string {
  const codes: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    429: 'RATE_LIMIT_EXCEEDED',
    500: 'INTERNAL_ERROR',
    503: 'SERVICE_UNAVAILABLE',
  };
  return codes[status] || 'UNKNOWN_ERROR';
}

/**
 * Assert function that throws ValidationError if condition is false
 */
export function assert(condition: boolean, message: string, details?: Record<string, unknown>): asserts condition {
  if (!condition) {
    throw new ValidationError(message, details);
  }
}

/**
 * Assert that a value is defined (not null or undefined)
 */
export function assertDefined<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new ValidationError(message);
  }
}

/**
 * Wrap async function to handle errors properly
 */
export function wrapAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (!isAppError(error)) {
        // Convert unknown errors to InternalServerError
        throw new InternalServerError(
          error instanceof Error ? error.message : 'An unexpected error occurred',
          { originalError: error instanceof Error ? error.message : String(error) }
        );
      }
      throw error;
    }
  }) as T;
}
