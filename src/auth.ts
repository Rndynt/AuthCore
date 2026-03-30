import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";
import { trustedOrigins, env, SESSION_CONFIG, isProduction } from "./env.js";

// Plugins
import { admin, organization } from "better-auth/plugins";
import { apiKey } from "better-auth/plugins";
import { jwt } from "better-auth/plugins";
import { bearer } from "better-auth/plugins";
import { twoFactor } from "better-auth/plugins";

const prisma = new PrismaClient({ log: ['warn','error'] });

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  // Public base URL of this Auth service (match Netlify domain in prod)
  url: env.BETTER_AUTH_URL,

  // Session configuration with proper security settings
  session: {
    cookieCache: { enabled: false },
    expiresIn: SESSION_CONFIG.maxAge,
    updateAge: 86400, // Update session every 24 hours
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
    requireEmailVerification: false, // Set to true in production with email service
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
  },

  // Secret for token/cookie signing
  secret: env.BETTER_AUTH_SECRET,

  // Rate limiting configuration
  rateLimit: {
    enabled: isProduction,
    window: 60, // 60 seconds
    max: 10,    // 10 requests per window for auth endpoints
  },

  plugins: [
    admin(),
    organization({
      // Email sending function for invitations (dev/testing only)
      sendInvitationEmail: async (data) => {
        // For development - just log the invitation details
        console.log('Invitation sent to:', data.email, 'for organization:', data.organization.name);
        console.log('Invitation ID:', data.invitation.id, 'Role:', data.invitation.role);
        // In production, implement actual email sending here
        // Example: await emailService.sendInvitation(data);
      }
    }),
    apiKey({
      // API key configuration
      defaultPrefix: 'ak_',
      enableMetadata: true,
    }),
    jwt({
      // JWT configuration
      jwks: {
        keyPairConfig: {
          alg: 'RS256',
        }
      }
    }),
    bearer(),  // Helper for Bearer APIs (use carefully)
    twoFactor({
      // Two-factor authentication (TOTP)
      issuer: 'AuthCore',
      otpOptions: {
        period: 30,
        digits: 6,
      }
    }),
  ],
});