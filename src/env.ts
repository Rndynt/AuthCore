import dotenv from "dotenv";
dotenv.config();

import { z } from "zod";

// Helper to get the development domain for Replit
const getDevUrl = () => {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return "http://localhost:5000";
};

// Helper to get trusted origins for development
const getDefaultTrustedOrigins = () => {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN},http://localhost:5000,http://localhost:3001,http://0.0.0.0:3001,https://0xauthcorex0.netlify.app`;
  }
  return "http://localhost:5000,http://localhost:3001,http://0.0.0.0:3001";
};

const DEFAULT_DEV_SECRET = "default-development-secret-key-change-in-production-min-24-chars";

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  BETTER_AUTH_URL: z.string().url().default(getDevUrl()),
  BETTER_AUTH_SECRET: z.string().min(24).default(DEFAULT_DEV_SECRET),
  TRUSTED_ORIGINS: z.string().default(getDefaultTrustedOrigins()),
  DATABASE_URL: z.string().url(),
  ENABLE_DEV_ENDPOINTS: z.string().default("true"),
  ADMIN_API_KEY: z.string().optional(),
  AUTH_MODE: z.enum(["single", "multi"]).default("single"),
  TENANT_ID: z.string().default("default-tenant"),
  TENANT_SCHEMA: z.string().default("public")
});

export const env = envSchema.parse(process.env);

if (process.env.NODE_ENV === "production" && env.BETTER_AUTH_SECRET === DEFAULT_DEV_SECRET) {
  throw new Error(
    "BETTER_AUTH_SECRET uses the built-in development value. Set a unique secret when NODE_ENV=production."
  );
}

export const trustedOrigins = env.TRUSTED_ORIGINS
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

export const devEnabled = process.env.ENABLE_DEV_ENDPOINTS === "true";
