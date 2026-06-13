/**
 * Multi-Tenant Auth Factory
 * Creates Better Auth instances per tenant with isolated Prisma clients
 * 
 * IMPROVEMENT: Added locking mechanism to prevent race conditions
 * when multiple concurrent requests try to create auth instances for the same tenant.
 */

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, organization, apiKey, jwt, bearer, twoFactor } from "better-auth/plugins";
import { PrismaClient } from "@prisma/client";
import { trustedOrigins, env, SESSION_CONFIG, isProduction } from '../../config/src/env.js';
import { tenantManager } from '../../adapters-runtime/src/tenant-connection-manager-impl.js';

// Type for Better Auth instance
type BetterAuthInstance = ReturnType<typeof betterAuth>;

// Cache Better Auth instances per tenant
const authInstances = new Map<string, BetterAuthInstance>();

// Lock map to prevent race conditions during instance creation
// Stores pending creation promises for each tenant
const authInstanceLocks = new Map<string, Promise<BetterAuthInstance>>();

// Statistics tracking
const creationStats = new Map<string, {
  createdAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
}>();

/**
 * Get or create Better Auth instance for specific tenant
 * 
 * This function is now async to support locking mechanism.
 * Multiple concurrent requests for the same tenant will wait for
 * the first creation to complete and share the same instance.
 * 
 * @param tenantId - The tenant identifier
 * @returns Promise resolving to the Better Auth instance for the tenant
 */
export async function getTenantAuth(tenantId: string): Promise<BetterAuthInstance> {
  // Check if instance already exists in cache
  const cachedInstance = authInstances.get(tenantId);
  if (cachedInstance) {
    // Update access statistics
    const stats = creationStats.get(tenantId);
    if (stats) {
      stats.lastAccessedAt = new Date();
      stats.accessCount++;
    }
    return cachedInstance;
  }

  // Check if there's a pending creation for this tenant
  // This prevents race conditions when multiple requests arrive simultaneously
  const pendingCreation = authInstanceLocks.get(tenantId);
  if (pendingCreation) {
    console.log(`[Auth Factory] Waiting for pending creation: ${tenantId}`);
    return pendingCreation;
  }

  // Create new instance with lock
  const creationPromise = createAuthInstance(tenantId);
  authInstanceLocks.set(tenantId, creationPromise);

  try {
    const instance = await creationPromise;
    return instance;
  } finally {
    // Clean up lock after creation completes (success or failure)
    authInstanceLocks.delete(tenantId);
  }
}

/**
 * Internal function to create a new Better Auth instance
 */
async function createAuthInstance(tenantId: string): Promise<BetterAuthInstance> {
  // Double-check cache (might have been created while waiting for lock)
  const cachedInstance = authInstances.get(tenantId);
  if (cachedInstance) {
    return cachedInstance;
  }

  // Get tenant-specific Prisma client
  const prisma = tenantManager.getClient(tenantId);
  const tenant = tenantManager.getTenant(tenantId);

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  console.log(`[Auth Factory] Creating Better Auth instance for tenant: ${tenantId}`);

  // Create tenant-specific Better Auth instance
  const authInstance = betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),

    // Public base URL of this Auth service
    url: env.BETTER_AUTH_URL,

    // Session configuration with proper security settings
    session: {
      cookieCache: { enabled: false },
      expiresIn: SESSION_CONFIG.maxAge,
      updateAge: 86400,
      cookieOptions: {
        secure: SESSION_CONFIG.cookieSecure,
        sameSite: SESSION_CONFIG.sameSite,
        httpOnly: true,
      }
    },

    // Cross-origin callers (frontends, admin dashboards)
    trustedOrigins,

    // Enable email/password with security options
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
    },

    // Secret for token/cookie signing
    secret: env.BETTER_AUTH_SECRET,

    // Rate limiting
    rateLimit: {
      enabled: isProduction,
      window: 60,
      max: 10,
    },

    plugins: [
      admin(),
      organization({
        // Email sending function for invitations (dev/testing only)
        sendInvitationEmail: async (data) => {
          console.log(`[Tenant ${tenantId}] Invitation sent to:`, data.email, 'for organization:', data.organization.name);
          console.log(`[Tenant ${tenantId}] Invitation ID:`, data.invitation.id, 'Role:', data.invitation.role);
          // In production, implement actual email sending here
        }
      }),
      apiKey({
        defaultPrefix: `${tenantId}_ak_`,
        enableMetadata: true,
      }),
      jwt({
        jwks: {
          keyPairConfig: {
            alg: 'RS256',
          }
        }
      }),
      bearer(),
      twoFactor({
        issuer: `AuthCore-${tenantId}`,
        otpOptions: {
          period: 30,
          digits: 6,
        }
      }),
    ],
  });

  // Cache the instance
  authInstances.set(tenantId, authInstance);
  
  // Initialize statistics
  creationStats.set(tenantId, {
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    accessCount: 1
  });

  console.log(`[Auth Factory] ✅ Cached Better Auth instance for tenant: ${tenantId}`);

  return authInstance;
}

/**
 * Clear cached auth instance for a tenant (useful for hot reload)
 * Also cleans up associated Prisma client if needed
 */
export function clearTenantAuthCache(tenantId?: string) {
  if (tenantId) {
    authInstances.delete(tenantId);
    creationStats.delete(tenantId);
    // Also remove any pending lock
    authInstanceLocks.delete(tenantId);
    console.log(`[Auth Factory] Cleared auth cache for tenant: ${tenantId}`);
  } else {
    authInstances.clear();
    creationStats.clear();
    authInstanceLocks.clear();
    console.log(`[Auth Factory] Cleared all auth caches`);
  }
}

/**
 * Get auth stats including cache and lock information
 */
export function getAuthStats() {
  return {
    cachedInstances: authInstances.size,
    pendingCreations: authInstanceLocks.size,
    tenants: Array.from(authInstances.keys()),
    pendingTenants: Array.from(authInstanceLocks.keys()),
    instanceDetails: Array.from(creationStats.entries()).map(([tenantId, stats]) => ({
      tenantId,
      createdAt: stats.createdAt.toISOString(),
      lastAccessedAt: stats.lastAccessedAt.toISOString(),
      accessCount: stats.accessCount,
      ageMs: Date.now() - stats.createdAt.getTime()
    }))
  };
}

/**
 * Sync version for backward compatibility
 * WARNING: This should only be used when you're certain the instance already exists
 * @deprecated Use getTenantAuth() instead
 */
export function getTenantAuthSync(tenantId: string): BetterAuthInstance | undefined {
  const instance = authInstances.get(tenantId);
  if (instance) {
    const stats = creationStats.get(tenantId);
    if (stats) {
      stats.lastAccessedAt = new Date();
      stats.accessCount++;
    }
  }
  return instance;
}
