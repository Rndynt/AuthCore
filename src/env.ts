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
    const origins = [
      `https://${process.env.REPLIT_DEV_DOMAIN}`,
      "http://localhost:5000",
      "http://localhost:3001",
      "http://0.0.0.0:3001",
      "https://0xauthcorex0.netlify.app"
    ];
    
    // Add Replit subdomain variants (e.g., ~00-xxx.spock.replit.dev)
    // Extract the suffix after the last "-00-" to support tilde subdomains
    const match = process.env.REPLIT_DEV_DOMAIN.match(/-00-(.+)$/);
    if (match) {
      origins.push(`https://~00-${match[1]}`);
    }
    
    return origins.join(",");
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
  ENABLE_DEV_ENDPOINTS: z.string().default("false"),
  AUTH_MODE: z.enum(["single", "multi"]).default("multi"),
  TENANT_ID: z.string().default("default-tenant"),
  TENANT_SCHEMA: z.string().default("public"),
  NESTED_TENANCY_ENABLED: z.string().default("false"),
  TENANT_CLIENT_IDLE_TTL_MS: z.coerce.number().default(5 * 60 * 1000)
});

type Env = z.infer<typeof envSchema>;

const rawEnv = envSchema.parse(process.env);

function sanitizeBetterAuthUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const origin = `${parsed.protocol}//${parsed.host}`;

    if (parsed.search || parsed.hash) {
      console.warn(
        `[env] BETTER_AUTH_URL contains a query or hash. Ignoring them and using "${origin}${parsed.pathname}".`
      );
    }

    const normalizedPath = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");

    return `${origin}${normalizedPath}`;
  } catch (error) {
    console.warn(
      `[env] BETTER_AUTH_URL is invalid: ${(error as Error).message}. Using provided value without normalization.`
    );
    return rawUrl;
  }
}

export const env: Env = {
  ...rawEnv,
  BETTER_AUTH_URL: sanitizeBetterAuthUrl(rawEnv.BETTER_AUTH_URL)
};

if (process.env.NODE_ENV === "production" && env.BETTER_AUTH_SECRET === DEFAULT_DEV_SECRET) {
  throw new Error(
    "BETTER_AUTH_SECRET uses the built-in development value. Set a unique secret when NODE_ENV=production."
  );
}

function normalizeOrigin(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Fix common mistakes like "http//" by ensuring the colon is present.
  const withProtocolSeparator = trimmed.replace(/^(https?)(\/\/)/i, "$1://");

  try {
    const url = new URL(withProtocolSeparator);
    return `${url.protocol}//${url.host}`;
  } catch (error) {
    console.warn(
      `[env] Ignoring invalid TRUSTED_ORIGINS entry "${trimmed}": ${(error as Error).message}`
    );
    return null;
  }
}

function normalizePossibleOrigin(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!trimmed.includes("://")) {
    return normalizeOrigin(`https://${trimmed}`);
  }

  return normalizeOrigin(trimmed);
}

const parsedOrigins = env.TRUSTED_ORIGINS
  .split(",")
  .map(normalizeOrigin)
  .filter((origin): origin is string => Boolean(origin));

const netlifyEnvOrigins = [
  normalizePossibleOrigin(process.env.URL),
  normalizePossibleOrigin(process.env.DEPLOY_URL),
  normalizePossibleOrigin(process.env.DEPLOY_PRIME_URL),
  normalizePossibleOrigin(process.env.NETLIFY_CUSTOM_DOMAIN)
].filter((origin): origin is string => Boolean(origin));

const derivedOrigins = [
  normalizePossibleOrigin(env.BETTER_AUTH_URL),
  ...netlifyEnvOrigins
].filter((origin): origin is string => Boolean(origin));

const allTrustedOrigins = [...parsedOrigins, ...derivedOrigins];

if (allTrustedOrigins.length === 0) {
  console.warn(
    "[env] TRUSTED_ORIGINS did not yield any valid origins. Falling back to runtime request origins."
  );
}

export const trustedOrigins = Array.from(new Set(allTrustedOrigins));

export const devEnabled = env.ENABLE_DEV_ENDPOINTS === "true";

export const nestedTenancyEnabled = env.NESTED_TENANCY_ENABLED === "true";
