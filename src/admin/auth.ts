/**
 * Admin Authentication System
 * Uses Better Auth with authcore_system schema
 * Completely isolated from tenant authentication
 */

import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@prisma/client';
import { admin } from 'better-auth/plugins';
import { env } from '../env.js';

const adminDatabaseUrl = new URL(env.DATABASE_URL);
adminDatabaseUrl.searchParams.set('schema', 'authcore_system');

// Prisma client for authcore_system schema
const adminPrisma = new PrismaClient({
  datasources: {
    db: {
      url: adminDatabaseUrl.toString()
    }
  },
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
});

// Admin-specific Better Auth instance
export const adminAuth = betterAuth({
  database: prismaAdapter(adminPrisma, { provider: "postgresql" }),

  // Base URL for admin auth
  url: env.BETTER_AUTH_URL,
  
  // Session configuration
  session: { 
    cookieCache: { enabled: false }
  },
  
  // Email/password authentication
  emailAndPassword: { 
    enabled: true,
    autoSignIn: true
  },
  
  // Secret for token/cookie signing
  secret: env.BETTER_AUTH_SECRET,
  
  // Plugins
  plugins: [
    admin() // Admin plugin for role-based access
  ],
  
  // Custom cookie name to avoid collision with tenant auth
  advanced: {
    cookiePrefix: 'authcore_admin'
  }
});

// Export Prisma client for direct queries if needed
export { adminPrisma };
