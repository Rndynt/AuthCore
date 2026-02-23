import dotenv from "dotenv";
dotenv.config();

import { z } from "zod";

// ============================================
// Environment Detection (Poin 18)
// ============================================
export const isProduction = process.env.NODE_ENV === "production";
export const isDevelopment = process.env.NODE_ENV !== "production";
export const isTest = process.env.NODE_ENV === "test";

// ============================================
// Environment-Specific Defaults (Poin 18)
// ============================================

// Rate limiting defaults per environment
export const RATE_LIMITS = {
  auth: isProduction ? 10 : 100,
  dev: isProduction ? 30 : 200,
  admin: isProduction ? 100 : 500,
  general: isProduction ? 60 : 300,
  health: isProduction ? 120 : 600,
};

// Session configuration per environment
export const SESSION_CONFIG = {
  maxAge: 604800,
  cookieSecure: isProduction,
  sameSite: isProduction ? 'strict' as const : 'lax' as const,
};

// Connection pool configuration per environment
export const POOL_CONFIG = {
  max: isProduction ? 30 : 10,
  idleTimeoutMillis: isProduction ? 60000 : 30000,
  connectionTimeoutMillis: isProduction ? 15000 : 10000,
};

// Tenant connection configuration per environment
export const TENANT_CONFIG = {
  maxConnectionsPerTenant: isProduction ? 5 : 3,
  idleTtlMs: isProduction ? 10 * 60 * 1000 : 5 * 60 * 1000,
  cleanupIntervalMs: isProduction ? 2 * 60 * 1000 : 60 * 1000,
};

// Helper to get the development domain for Replit
const getDevUrl = (): string => {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return "http://localhost:5000";
};

// Helper to get trusted origins for development
const getDefaultTrustedOrigins = (): string => {
  if (process.env.REPLIT_DEV_DOMAIN) {
    const origins = [
      `https://${process.env.REPLIT_DEV_DOMAIN}`,
      "http://localhost:5000",
      "http://localhost:3001",
      "http://0.0.0.0:3001",
      "https://0xauthcorex0.netlify.app"
    ];
    
    const match = process.env.REPLIT_DEV_DOMAIN.match(/-00-(.+)$/);
    if (match) {
      origins.push(`https://~00-${match[1]}`);
    }
    
    return origins.join(",");
  }
  return "http://localhost:5000,http://localhost:3001,http://0.0.0.0:3001";
};

const DEFAULT_DEV_SECRET = "default-development-secret-key-change-in-production-min-24-chars";

// ============================================
// Environment Schema (Poin 11 - Safe Validation)
// ============================================
const envSchema = z.object({
  // Server configuration
  PORT: z.number().int().positive().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  
  // Auth configuration
  BETTER_AUTH_URL: z.string().url().default(getDevUrl()),
  BETTER_AUTH_SECRET: z.string().min(24).default(DEFAULT_DEV_SECRET),
  
  // CORS configuration
  TRUSTED_ORIGINS: z.string().default(getDefaultTrustedOrigins()),
  
  // Database configuration
  DATABASE_URL: z.string().url(),
  
  // Dev endpoints configuration
  ENABLE_DEV_ENDPOINTS: z.enum(["true", "false"]).default("false"),
  DEV_ENDPOINTS_IP_ALLOWLIST: z.string().default(""),
  DEV_ENDPOINTS_REQUIRE_ADMIN: z.enum(["true", "false"]).default("false"),
  
  // Auth mode configuration
  AUTH_MODE: z.enum(["single", "multi"]).default("multi"),
  TENANT_ID: z.string().min(1).max(63).default("default-tenant"),
  TENANT_SCHEMA: z.string().min(1).max(63).default("public"),
  
  // Multi-tenant configuration
  NESTED_TENANCY_ENABLED: z.enum(["true", "false"]).default("false"),
  TENANT_CLIENT_IDLE_TTL_MS: z.number().int().positive().default(TENANT_CONFIG.idleTtlMs),
  
  // Rate limiting configuration (overrides)
  RATE_LIMIT_AUTH: z.number().int().positive().optional(),
  RATE_LIMIT_DEV: z.number().int().positive().optional(),
  RATE_LIMIT_ADMIN: z.number().int().positive().optional(),
  RATE_LIMIT_GENERAL: z.number().int().positive().optional(),
  
  // Connection pool configuration (overrides)
  POOL_MAX: z.number().int().positive().optional(),
  POOL_IDLE_TIMEOUT_MS: z.number().int().positive().optional(),
});

// Pre-process environment variables (convert strings to numbers where needed)
const preprocessEnv = (env: Record<string, string | undefined>) => {
  const result: Record<string, string | number | undefined> = {};
  
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    
    // Numeric fields
    if (['PORT', 'TENANT_CLIENT_IDLE_TTL_MS', 'RATE_LIMIT_AUTH', 'RATE_LIMIT_DEV', 
         'RATE_LIMIT_ADMIN', 'RATE_LIMIT_GENERAL', 'POOL_MAX', 'POOL_IDLE_TIMEOUT_MS'].includes(key)) {
      const num = parseInt(value, 10);
      if (!isNaN(num)) {
        result[key] = num;
      }
    } else {
      result[key] = value;
    }
  }
  
  return result;
};

type Env = z.infer<typeof envSchema>;

// Parse with detailed error handling
const parseResult = envSchema.safeParse(preprocessEnv(process.env));
if (!parseResult.success) {
  const errors = parseResult.error.errors.map(e => 
    `  - ${e.path.join('.')}: ${e.message}`
  ).join('\n');
  throw new Error(`Environment validation failed:\n${errors}`);
}

const rawEnv = parseResult.data;

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

function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

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

function normalizeTrustedOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withProtocolSeparator = trimmed.replace(/^(https?)(\/\/)/i, "$1://");

  if (withProtocolSeparator.includes("*")) {
    const match = withProtocolSeparator.match(/^(https?):\/\/\*\.(.+)$/i);
    if (!match) {
      console.warn(
        `[env] Ignoring invalid TRUSTED_ORIGINS wildcard "${trimmed}". Use "https://*.example.com".`
      );
      return null;
    }

    const protocol = match[1].toLowerCase();
    const host = match[2].toLowerCase();

    if (!host || host.includes("/")) {
      console.warn(
        `[env] Ignoring invalid TRUSTED_ORIGINS wildcard "${trimmed}". Host must not include a path.`
      );
      return null;
    }

    return `${protocol}://*.${host}`;
  }

  return normalizeOrigin(withProtocolSeparator);
}

function normalizePossibleOrigin(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!trimmed.includes("://")) {
    return normalizeOrigin(`https://${trimmed}`);
  }

  return normalizeOrigin(trimmed);
}

const parsedOrigins: string[] = env.TRUSTED_ORIGINS
  .split(",")
  .map(normalizeTrustedOrigin)
  .filter((origin): origin is string => origin !== null);

const netlifyEnvOrigins: string[] = [
  normalizePossibleOrigin(process.env.URL),
  normalizePossibleOrigin(process.env.DEPLOY_URL),
  normalizePossibleOrigin(process.env.DEPLOY_PRIME_URL),
  normalizePossibleOrigin(process.env.NETLIFY_CUSTOM_DOMAIN)
].filter((origin): origin is string => origin !== null);

const derivedOrigins: string[] = [
  normalizePossibleOrigin(env.BETTER_AUTH_URL),
  ...netlifyEnvOrigins
].filter((origin): origin is string => origin !== null);

const allTrustedOrigins = [...parsedOrigins, ...derivedOrigins];

if (allTrustedOrigins.length === 0) {
  console.warn(
    "[env] TRUSTED_ORIGINS did not yield any valid origins. Falling back to runtime request origins."
  );
}

export const trustedOrigins: string[] = Array.from(new Set(allTrustedOrigins));

export const devEnabled = env.ENABLE_DEV_ENDPOINTS === "true";

export const nestedTenancyEnabled = env.NESTED_TENANCY_ENABLED === "true";

export function isOriginTrusted(origin: string): boolean {
  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return false;
  }

  const parsed = new URL(normalized);
  const originHost = parsed.host.toLowerCase();
  const originProtocol = parsed.protocol.toLowerCase();

  return trustedOrigins.some((entry) => {
    if (entry.includes("*")) {
      const match = entry.match(/^(https?):\/\/\*\.(.+)$/i);
      if (!match) {
        return false;
      }

      const protocol = match[1].toLowerCase();
      const hostSuffix = match[2].toLowerCase();
      if (originProtocol !== `${protocol}:`) {
        return false;
      }

      if (!originHost.endsWith(`.${hostSuffix}`)) {
        return false;
      }

      return originHost.length > hostSuffix.length + 1;
    }

    return entry.toLowerCase() === normalized.toLowerCase();
  });
}
