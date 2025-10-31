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

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  BETTER_AUTH_URL: z.string().url().default(getDevUrl()),
  BETTER_AUTH_SECRET: z.string().min(24).default("default-development-secret-key-change-in-production-min-24-chars"),
  TRUSTED_ORIGINS: z.string().default(getDefaultTrustedOrigins()),
  DATABASE_URL: z.string().url(),
  ENABLE_DEV_ENDPOINTS: z.string().default("false"),
  ADMIN_API_KEY: z.string().optional()
});

export const env = envSchema.parse(process.env);

export const trustedOrigins = env.TRUSTED_ORIGINS
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

export const devEnabled = process.env.ENABLE_DEV_ENDPOINTS === 'true';