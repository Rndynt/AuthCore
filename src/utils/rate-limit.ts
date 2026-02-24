/**
 * Rate Limiting Configuration
 * 
 * Implements tiered rate limiting for different endpoint types:
 * - Auth endpoints: Stricter limits to prevent brute force
 * - Dev endpoints: Moderate limits with IP allowlist support
 * - Admin API: Higher limits for authenticated admin users
 * - General API: Standard limits
 * 
 * Security improvements (Poin 3):
 * - Prevents brute force attacks on auth endpoints
 * - Mitigates DoS attacks
 * - Protects against credential stuffing
 */

import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../env.js';

// Rate limit configuration per endpoint type
interface RateLimitConfig {
  max: number;
  timeWindow: string;
  keyGenerator?: (request: FastifyRequest) => string;
  onExceeded?: (request: FastifyRequest, key: string) => void;
  skipOnError?: boolean;
}

const isProduction = process.env.NODE_ENV === 'production';

// Default configurations
const RATE_LIMIT_CONFIGS = {
  // Auth endpoints - strict limits to prevent brute force
  auth: {
    max: isProduction ? 10 : 100, // 10 attempts per minute in production
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest): string => {
      // Combine IP + User-Agent for better fingerprinting
      const ip = request.ip || 'unknown';
      const userAgent = request.headers['user-agent'] || 'unknown';
      return `${ip}:${userAgent.slice(0, 50)}`;
    },
  },

  // Dev endpoints - moderate limits
  dev: {
    max: isProduction ? 30 : 200,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest): string => {
      return request.ip || 'unknown';
    },
  },

  // Admin API - higher limits for authenticated users
  admin: {
    max: isProduction ? 100 : 500,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest): string => {
      // Use admin user ID if available, otherwise IP
      const adminUser = (request as any).adminUser;
      if (adminUser?.id) {
        return `admin:${adminUser.id}`;
      }
      return `ip:${request.ip || 'unknown'}`;
    },
  },

  // General API - standard limits
  general: {
    max: isProduction ? 60 : 300,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest): string => {
      return request.ip || 'unknown';
    },
  },

  // Health check - very permissive
  health: {
    max: isProduction ? 120 : 600,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest): string => {
      return request.ip || 'unknown';
    },
  },
};

// IP allowlist for internal services
const IP_ALLOWLIST = new Set<string>(
  (process.env.RATE_LIMIT_IP_ALLOWLIST || '127.0.0.1,::1')
    .split(',')
    .map(ip => ip.trim())
    .filter(Boolean)
);

// Check if IP is in allowlist
function isIpAllowed(ip: string): boolean {
  return IP_ALLOWLIST.has(ip);
}

// Custom key generator that skips allowlisted IPs
function createKeyGenerator(baseGenerator: (request: FastifyRequest) => string) {
  return (request: FastifyRequest): string => {
    const ip = request.ip || 'unknown';
    
    // Skip rate limiting for allowlisted IPs
    if (isIpAllowed(ip)) {
      return `allowed:${ip}`;
    }
    
    return baseGenerator(request);
  };
}

// Handler for rate limit exceeded - Fixed signature for Fastify 5.x
function onRateLimitExceeded(request: FastifyRequest, key: string): void {
  const ip = request.ip || 'unknown';
  console.warn(`[Rate Limit] Exceeded for IP: ${ip}, Key: ${key}, Path: ${request.url}`);
}

/**
 * Register rate limiting on the Fastify app
 */
export async function registerRateLimiting(app: FastifyInstance): Promise<void> {
  // Register the rate limit plugin
  await app.register(rateLimit, {
    global: false, // We'll apply rate limits per route group
    nameSpace: 'realmio:rate-limit:',
    continueExceeding: true,
    skipOnError: true, // Don't block requests if rate limit store fails
    enableDraftSpec: true, // Use draft spec headers
    addHeadersOnExceeding: {
      'X-RateLimit-Limit': true,
      'X-RateLimit-Remaining': true,
      'X-RateLimit-Reset': true,
    },
    addHeaders: {
      'X-RateLimit-Limit': true,
      'X-RateLimit-Remaining': true,
      'X-RateLimit-Reset': true,
      'Retry-After': true,
    },
  });

  console.log('✅ Rate limiting registered');
}

/**
 * Create rate limit middleware for auth endpoints
 */
export function createAuthRateLimit() {
  return {
    max: RATE_LIMIT_CONFIGS.auth.max,
    timeWindow: RATE_LIMIT_CONFIGS.auth.timeWindow,
    keyGenerator: createKeyGenerator(RATE_LIMIT_CONFIGS.auth.keyGenerator!),
    onExceeding: (request: FastifyRequest, key: string) => {
      console.warn(`[Rate Limit] Auth endpoint approaching limit: ${key}`);
    },
    onExceeded: onRateLimitExceeded,
  };
}

/**
 * Create rate limit middleware for dev endpoints
 */
export function createDevRateLimit() {
  return {
    max: RATE_LIMIT_CONFIGS.dev.max,
    timeWindow: RATE_LIMIT_CONFIGS.dev.timeWindow,
    keyGenerator: createKeyGenerator(RATE_LIMIT_CONFIGS.dev.keyGenerator!),
    onExceeded: onRateLimitExceeded,
  };
}

/**
 * Create rate limit middleware for admin API
 */
export function createAdminRateLimit() {
  return {
    max: RATE_LIMIT_CONFIGS.admin.max,
    timeWindow: RATE_LIMIT_CONFIGS.admin.timeWindow,
    keyGenerator: createKeyGenerator(RATE_LIMIT_CONFIGS.admin.keyGenerator!),
    onExceeded: onRateLimitExceeded,
  };
}

/**
 * Create rate limit middleware for general API
 */
export function createGeneralRateLimit() {
  return {
    max: RATE_LIMIT_CONFIGS.general.max,
    timeWindow: RATE_LIMIT_CONFIGS.general.timeWindow,
    keyGenerator: createKeyGenerator(RATE_LIMIT_CONFIGS.general.keyGenerator!),
    onExceeded: onRateLimitExceeded,
  };
}

/**
 * Create rate limit middleware for health check
 */
export function createHealthRateLimit() {
  return {
    max: RATE_LIMIT_CONFIGS.health.max,
    timeWindow: RATE_LIMIT_CONFIGS.health.timeWindow,
    keyGenerator: createKeyGenerator(RATE_LIMIT_CONFIGS.health.keyGenerator!),
    onExceeded: onRateLimitExceeded,
  };
}

/**
 * Get rate limit stats for monitoring
 */
export function getRateLimitStats() {
  return {
    configs: {
      auth: { max: RATE_LIMIT_CONFIGS.auth.max, timeWindow: RATE_LIMIT_CONFIGS.auth.timeWindow },
      dev: { max: RATE_LIMIT_CONFIGS.dev.max, timeWindow: RATE_LIMIT_CONFIGS.dev.timeWindow },
      admin: { max: RATE_LIMIT_CONFIGS.admin.max, timeWindow: RATE_LIMIT_CONFIGS.admin.timeWindow },
      general: { max: RATE_LIMIT_CONFIGS.general.max, timeWindow: RATE_LIMIT_CONFIGS.general.timeWindow },
      health: { max: RATE_LIMIT_CONFIGS.health.max, timeWindow: RATE_LIMIT_CONFIGS.health.timeWindow },
    },
    ipAllowlist: Array.from(IP_ALLOWLIST),
    isProduction,
  };
}

// Export types
export type { RateLimitConfig };
