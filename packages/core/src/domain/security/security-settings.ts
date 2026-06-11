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
// NOTE: This is a basic regex-based validator. For production use,
// the ip-utils.ts module provides proper validation using ipaddr.js
export function isValidIpOrCidr(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  
  const trimmed = value.trim();
  
  // IPv4 with optional CIDR
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  // IPv6 with optional CIDR (simplified - covers most common formats)
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(\/\d{1,3})?$/;
  // IPv6 compressed with optional CIDR
  const ipv6CompressedRegex = /^::([0-9a-fA-F]{0,4}:)*[0-9a-fA-F]{0,4}(\/\d{1,3})?$/;
  
  if (ipv4Regex.test(trimmed)) {
    // Validate each octet is 0-255
    const parts = trimmed.split('/')[0].split('.');
    return parts.every(p => parseInt(p, 10) <= 255);
  }
  
  if (ipv6Regex.test(trimmed) || ipv6CompressedRegex.test(trimmed)) {
    return true;
  }
  
  return false;
}

// Helper to check if an IP is blocked
// NOTE: This is a fallback implementation. The ip-utils.ts module provides
// proper CIDR matching using ipaddr.js and should be preferred.
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
      // Proper CIDR matching using ipaddr.js-compatible approach
      // This handles IPv4 CIDR ranges correctly
      try {
        const [cidrIp, prefixStr] = entry.ip.split('/');
        const prefix = parseInt(prefixStr, 10);
        
        if (isNaN(prefix)) continue;
        
        // IPv4 CIDR matching
        const ipParts = ip.split('.').map(Number);
        const cidrParts = cidrIp.split('.').map(Number);
        
        if (ipParts.length === 4 && cidrParts.length === 4) {
          const mask = ~(0xFFFFFFFF >>> prefix) >>> 0;
          const ipNum = ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;
          const cidrNum = ((cidrParts[0] << 24) | (cidrParts[1] << 16) | (cidrParts[2] << 8) | cidrParts[3]) >>> 0;
          
          if ((ipNum & mask) === (cidrNum & mask)) {
            return { blocked: true, entry };
          }
        }
      } catch {
        // Skip invalid CIDR entries
        continue;
      }
    } else {
      // Exact IP match (case-insensitive for IPv6)
      if (ip.toLowerCase() === entry.ip.toLowerCase()) {
        return { blocked: true, entry };
      }
    }
  }
  
  return { blocked: false };
}
