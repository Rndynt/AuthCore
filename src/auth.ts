import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";
import { trustedOrigins, env } from "./env.js";

// Plugins
import { admin, organization } from "better-auth/plugins";
import { apiKey } from "better-auth/plugins";
import { jwt } from "better-auth/plugins";
import { bearer } from "better-auth/plugins";

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  // Public base URL of this Auth service (match Netlify domain in prod)
  url: env.BETTER_AUTH_URL,

  // Keep it simple for Netlify: single Set-Cookie
  session: { cookieCache: { enabled: false } },

  // Cross-origin callers (frontends, admin dashboards)
  trustedOrigins,

  // Enable email/password
  emailAndPassword: { enabled: true },

  // Secret for token/cookie signing
  secret: env.BETTER_AUTH_SECRET,

  plugins: [
    admin(),
    organization(),
    apiKey(), // S2S via x-api-key (mock session)
    jwt(),    // Token issuance + JWKS for offline verification
    bearer()  // Helper for Bearer APIs (use carefully)
  ],
});