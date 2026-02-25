/**
 * IP Address Utilities
 * Handles IPv4 and IPv6 address validation and CIDR matching
 */

import * as ipaddr from 'ipaddr.js';

export interface IpMatchResult {
  matched: boolean;
  type?: 'ipv4' | 'ipv6';
  cidr?: string;
}

/**
 * Check if a string is a valid IP address (IPv4 or IPv6)
 */
export function isValidIp(ip: string): boolean {
  try {
    ipaddr.parse(ip);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a string is a valid CIDR notation (IPv4 or IPv6)
 */
export function isValidCidr(cidr: string): boolean {
  try {
    ipaddr.parseCIDR(cidr);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a string is a valid IP or CIDR
 */
export function isValidIpOrCidr(value: string): boolean {
  return isValidIp(value) || isValidCidr(value);
}

/**
 * Get IP address type
 */
export function getIpType(ip: string): 'ipv4' | 'ipv6' | null {
  try {
    const parsed = ipaddr.parse(ip);
    return parsed.kind() === 'ipv4' ? 'ipv4' : 'ipv6';
  } catch {
    return null;
  }
}

/**
 * Check if an IP matches a CIDR range
 * Works for both IPv4 and IPv6
 */
export function ipMatchesCidr(ip: string, cidr: string): boolean {
  try {
    const parsedIp = ipaddr.parse(ip);
    const parsedRange = ipaddr.parseCIDR(cidr);
    
    // IPv4 and IPv6 cannot match each other
    if (parsedIp.kind() !== parsedRange[0].kind()) {
      return false;
    }
    
    return parsedIp.match(parsedRange);
  } catch {
    return false;
  }
}

/**
 * Check if an IP is in a blocklist
 * Supports both IPv4 and IPv6, with CIDR matching
 */
export function isIpInBlocklist(
  ip: string,
  blocklist: Array<{ ip: string; isCidr: boolean; expiresAt?: Date | null }>
): { blocked: boolean; matchedEntry?: typeof blocklist[0] } {
  const now = new Date();
  
  // Validate input IP
  if (!isValidIp(ip)) {
    return { blocked: false };
  }
  
  for (const entry of blocklist) {
    // Skip expired entries
    if (entry.expiresAt && entry.expiresAt < now) {
      continue;
    }
    
    if (entry.isCidr) {
      // CIDR matching (supports IPv4 and IPv6)
      if (ipMatchesCidr(ip, entry.ip)) {
        return { blocked: true, matchedEntry: entry };
      }
    } else {
      // Exact IP match
      try {
        const blockedIp = ipaddr.parse(entry.ip);
        const inputIp = ipaddr.parse(ip);
        
        // Must be same IP type
        if (blockedIp.kind() !== inputIp.kind()) {
          continue;
        }
        
        // Compare normalized representations
        if (blockedIp.toString() === inputIp.toString()) {
          return { blocked: true, matchedEntry: entry };
        }
      } catch {
        continue;
      }
    }
  }
  
  return { blocked: false };
}

/**
 * Normalize an IP address to its canonical form
 */
export function normalizeIp(ip: string): string | null {
  try {
    const parsed = ipaddr.parse(ip);
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Convert IPv4-mapped IPv6 to IPv4
 * Example: ::ffff:192.168.1.1 -> 192.168.1.1
 */
export function convertIpv4Mapped(ip: string): string {
  try {
    const parsed = ipaddr.parse(ip);
    
    if (parsed.kind() === 'ipv6') {
      const ipv6 = parsed as ipaddr.IPv6;
      if (ipv6.isIPv4MappedAddress()) {
        return ipv6.toIPv4Address().toString();
      }
    }
    
    return ip;
  } catch {
    return ip;
  }
}

/**
 * Get subnet mask from CIDR prefix
 */
export function getSubnetMask(cidr: string): string | null {
  try {
    const [ip, prefix] = ipaddr.parseCIDR(cidr);
    
    if (ip.kind() === 'ipv4') {
      // Calculate IPv4 subnet mask
      const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
      return [
        (mask >>> 24) & 0xFF,
        (mask >>> 16) & 0xFF,
        (mask >>> 8) & 0xFF,
        mask & 0xFF
      ].join('.');
    } else {
      // IPv6 prefix length
      return `/${prefix}`;
    }
  } catch {
    return null;
  }
}

export { ipaddr };
