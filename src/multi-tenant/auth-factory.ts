/**
 * Multi-Tenant Auth Factory
 * Creates Better Auth instances per tenant with isolated Prisma clients
 */

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, organization, apiKey, jwt, bearer } from "better-auth/plugins";
import Prisma from "@prisma/client";
import { trustedOrigins, env } from "../env.js";
import { tenantManager } from "./connection-manager.js";

const { PrismaClient } = Prisma;

// Cache Better Auth instances per tenant
const authInstances = new Map<string, ReturnType<typeof betterAuth>>();

/**
 * Get or create Better Auth instance for specific tenant
 */
export function getTenantAuth(tenantId: string) {
  // Return cached instance if exists
  if (authInstances.has(tenantId)) {
    return authInstances.get(tenantId)!;
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

    // Keep it simple for Netlify: single Set-Cookie
    session: { 
      cookieCache: { enabled: false }
    },

    // Cross-origin callers (frontends, admin dashboards)
    trustedOrigins,

    // Enable email/password
    emailAndPassword: { enabled: true },

    // Secret for token/cookie signing
    secret: env.BETTER_AUTH_SECRET,

    plugins: [
      admin(),
      organization({
        // Email sending function for invitations (dev/testing only)
        sendInvitationEmail: async (data) => {
          // For development - just log the invitation details
          console.log(`[Tenant ${tenantId}] Invitation sent to:`, data.email, 'for organization:', data.organization.name);
          console.log(`[Tenant ${tenantId}] Invitation ID:`, data.invitation.id, 'Role:', data.invitation.role);
          // In production, implement actual email sending here
        }
      }),
      apiKey(), // S2S via x-api-key (mock session)
      jwt(),    // Token issuance + JWKS for offline verification
      bearer()  // Helper for Bearer APIs (use carefully)
    ],
  });

  // Cache the instance
  authInstances.set(tenantId, authInstance);
  console.log(`[Auth Factory] ✅ Cached Better Auth instance for tenant: ${tenantId}`);

  return authInstance;
}

/**
 * Clear cached auth instance for a tenant (useful for hot reload)
 */
export function clearTenantAuthCache(tenantId?: string) {
  if (tenantId) {
    authInstances.delete(tenantId);
    console.log(`[Auth Factory] Cleared auth cache for tenant: ${tenantId}`);
  } else {
    authInstances.clear();
    console.log(`[Auth Factory] Cleared all auth caches`);
  }
}

/**
 * Get auth stats
 */
export function getAuthStats() {
  return {
    cachedInstances: authInstances.size,
    tenants: Array.from(authInstances.keys())
  };
}
