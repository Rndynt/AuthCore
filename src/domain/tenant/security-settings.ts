export interface SecuritySettings {
  trustedOrigins: string[];
  enableDevEndpoints: boolean;
  apiKeyRotationDays: number | null;
  adminIpAllowlist: string[];
  enforceAdminMfa: boolean;
  readOnlyMode: boolean;
}
