/**
 * Security Settings Domain Model
 * 
 * Comprehensive security configuration for the platform including:
 * - Trusted origins management
 * - IP blocking
 * - Rate limiting configuration
 * - Admin security settings
 */

export interface IpBlockEntry {
  ip: string;
  reason: string;
  blockedAt: Date;
  blockedBy: string;
  expiresAt?: Date | null;
  isCidr: boolean;
}

export interface RateLimitSettings {
  authMax: number;
  authWindowMs: number;
  devMax: number;
  devWindowMs: number;
  adminMax: number;
  adminWindowMs: number;
  generalMax: number;
  generalWindowMs: number;
  healthMax: number;
  healthWindowMs: number;
}

export interface SecuritySettings {
  trustedOrigins: string[];
  enableDevEndpoints: boolean;
  apiKeyRotationDays: number | null;
  adminIpAllowlist: string[];
  enforceAdminMfa: boolean;
  readOnlyMode: boolean;
  
  // New features
  ipBlocklist: IpBlockEntry[];
  rateLimitOverrides: Partial<RateLimitSettings>;
  enableIpBlocking: boolean;
  enableRateLimitLogging: boolean;
  blockOnRateLimitExceeded: boolean;
  rateLimitBlockDurationMs: number;
}

export interface CreateIpBlockInput {
  ip: string;
  reason: string;
  blockedBy: string;
  expiresInMs?: number;
}

export interface UpdateSecuritySettingsInput {
  trustedOrigins?: string[];
  enableDevEndpoints?: boolean;
  apiKeyRotationDays?: number | null;
  adminIpAllowlist?: string[];
  enforceAdminMfa?: boolean;
  readOnlyMode?: boolean;
  enableIpBlocking?: boolean;
  enableRateLimitLogging?: boolean;
  blockOnRateLimitExceeded?: boolean;
  rateLimitBlockDurationMs?: number;
  rateLimitOverrides?: Partial<RateLimitSettings>;
}

// Default rate limit settings
export const DEFAULT_RATE_LIMIT_SETTINGS: RateLimitSettings = {
  authMax: 10,
  authWindowMs: 60000, // 1 minute
  devMax: 30,
  devWindowMs: 60000,
  adminMax: 100,
  adminWindowMs: 60000,
  generalMax: 60,
  generalWindowMs: 60000,
  healthMax: 120,
  healthWindowMs: 60000,
};

// Helper to validate IP address or CIDR
export function isValidIpOrCidr(value: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  const cidr6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\/\d{1,3}$/;
  
  if (ipv4Regex.test(value) || ipv6Regex.test(value)) {
    return true;
  }
  
  if (cidrRegex.test(value) || cidr6Regex.test(value)) {
    return true;
  }
  
  return false;
}

// Helper to check if an IP is blocked
export function isIpBlocked(
  ip: string,
  blocklist: IpBlockEntry[]
): { blocked: boolean; entry?: IpBlockEntry } {
  const now = new Date();
  
  for (const entry of blocklist) {
    // Check if entry has expired
    if (entry.expiresAt && entry.expiresAt < now) {
      continue;
    }
    
    if (entry.isCidr) {
      // CIDR matching would require additional library
      // For now, do simple prefix matching for common CIDR patterns
      const prefix = entry.ip.split('/')[0];
      if (ip.startsWith(prefix.substring(0, prefix.lastIndexOf('.')))) {
        return { blocked: true, entry };
      }
    } else {
      if (ip === entry.ip) {
        return { blocked: true, entry };
      }
    }
  }
  
  return { blocked: false };
}
