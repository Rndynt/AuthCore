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
    return `https://${process.env.REPLIT_DEV_DOMAIN},http://localhost:5000,http://0.0.0.0:5000`;
  }
  return "http://localhost:5000,http://0.0.0.0:5000";
};

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  BETTER_AUTH_URL: z.string().url().default(getDevUrl()),
  BETTER_AUTH_SECRET: z.string().min(24).default("default-development-secret-key-change-in-production-min-24-chars"),
  TRUSTED_ORIGINS: z.string().default(getDefaultTrustedOrigins()),
  DATABASE_URL: z.string().url()
});

export const env = envSchema.parse(process.env);

export const trustedOrigins = env.TRUSTED_ORIGINS
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);