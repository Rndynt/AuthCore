import type { SecuritySettings } from '../domain/security/security-settings';
export interface SecuritySettingsRepository {
  ensureAdminSettingsTable(): Promise<void>;
  getSecuritySettings(): Promise<SecuritySettings | null>;
  updateSecuritySettings(adminUserId: string, settings: SecuritySettings): Promise<void>;
}
