import type { Pool } from 'pg';
import type { SecuritySettings } from '../../core/src/domain/security/security-settings';
import type { SecuritySettingsRepository } from '../../core/src/ports/security-settings-repository';
import { createPgPool } from './pg-pool';

export class PgSecuritySettingsRepository implements SecuritySettingsRepository {
  private initialized = false;
  constructor(private readonly pool: Pool = createPgPool()) {}
  async ensureAdminSettingsTable(): Promise<void> { if (this.initialized) return; await this.pool.query(`CREATE TABLE IF NOT EXISTS authcore_system.admin_settings (id INTEGER PRIMARY KEY, settings JSONB NOT NULL, updated_by TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`); this.initialized = true; }
  async getSecuritySettings(): Promise<SecuritySettings | null> { const r = await this.pool.query<{ settings: SecuritySettings }>(`SELECT settings FROM authcore_system.admin_settings WHERE id = 1`); return r.rows[0]?.settings ?? null; }
  async updateSecuritySettings(adminUserId: string, settings: SecuritySettings): Promise<void> { await this.pool.query(`INSERT INTO authcore_system.admin_settings (id, settings, updated_by, updated_at) VALUES (1, $1::jsonb, $2, NOW()) ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`, [JSON.stringify(settings), adminUserId]); }
}
