/**
 * Seed admin user into authcore_system schema.
 * Uses @noble/hashes/scrypt — same algorithm as better-auth 1.5+
 * Format: N:16384, r:16, p:1, dkLen:64  →  "<hex-salt>:<hex-key>"
 */
import pkg from 'pg';
import { scryptAsync } from '@noble/hashes/scrypt';

const { Pool } = pkg;

const SCRYPT_CONFIG = { N: 16384, r: 16, p: 1, dkLen: 64 } as const;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string): Promise<string> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = toHex(saltBytes);
  const key = await scryptAsync(password.normalize('NFKC'), salt, {
    N: SCRYPT_CONFIG.N,
    r: SCRYPT_CONFIG.r,
    p: SCRYPT_CONFIG.p,
    dkLen: SCRYPT_CONFIG.dkLen,
    maxmem: 128 * SCRYPT_CONFIG.N * SCRYPT_CONFIG.r * 2,
  });
  return `${salt}:${toHex(key)}`;
}

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seedAdminUser() {
  const EMAIL    = process.env.ADMIN_EMAIL    ?? 'admin@realmio.id';
  const PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin2026!';
  const NAME     = process.env.ADMIN_NAME     ?? 'Realmio Admin';

  try {
    console.log('🌱 Seeding admin user to authcore_system schema…\n');
    await pool.query(`SET search_path TO authcore_system, public`);

    const existing = await pool.query(
      `SELECT id FROM users WHERE email = $1`, [EMAIL]
    );

    const now = new Date();

    if (existing.rows.length > 0) {
      const userId = existing.rows[0].id as string;
      console.log(`⚠️  User ${EMAIL} already exists — updating password & role…`);

      const passwordHash = await hashPassword(PASSWORD);
      await pool.query(
        `UPDATE accounts SET password = $1, "updatedAt" = $2
         WHERE user_id = $3 AND "providerId" = 'credential'`,
        [passwordHash, now, userId]
      );
      await pool.query(
        `UPDATE users SET role = 'admin', "emailVerified" = true, "updatedAt" = $1 WHERE id = $2`,
        [now, userId]
      );
      console.log('✅ Password & role updated.\n');
    } else {
      const userId    = generateId();
      const accountId = generateId();
      const passwordHash = await hashPassword(PASSWORD);

      await pool.query(
        `INSERT INTO users (id, email, name, "emailVerified", role, banned, "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [userId, EMAIL, NAME, true, 'admin', false, now, now]
      );
      await pool.query(
        `INSERT INTO accounts (id, "accountId", "providerId", user_id, password, "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [accountId, accountId, 'credential', userId, passwordHash, now, now]
      );
      console.log('✅ Admin user created.\n');
    }

    console.log('📧 Email   :', EMAIL);
    console.log('🔑 Password:', PASSWORD);
    console.log('\n⚠️  Change this password after first login!\n');
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

seedAdminUser()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
