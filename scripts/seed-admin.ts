import pkg from 'pg';
const { Pool } = pkg;
import { randomBytes, scrypt as scryptCallback } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);

// Connect to authcore_system schema
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: '-c search_path=authcore_system,public',
});

// Better Auth hashes passwords using scrypt with these parameters
const SCRYPT_SETTINGS = {
  N: 16384,
  r: 16,
  p: 1,
  maxmem: 128 * 16384 * 16 * 2
};

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(
    password.normalize('NFKC'),
    Buffer.from(salt, 'hex'),
    64,
    SCRYPT_SETTINGS
  ) as Buffer;

  return `${salt}:${derivedKey.toString('hex')}`;
}

function generateId(): string {
  return randomBytes(16).toString('hex');
}

async function seedAdminUser() {
  try {
    console.log('🌱 Seeding admin users to authcore_system schema...\n');

    // Check if root already exists (using schema-qualified search_path)
    const existing = await pool.query(`
      SELECT id FROM users WHERE email = $1
    `, ['root@authcore.local']);

    const now = new Date();
    const defaultPassword = 'AuthCore123!';

    if (existing.rows.length > 0) {
      const existingUserId = existing.rows[0].id;
      console.log('⚠️  Root admin already exists. Verifying credential hash format...');

      const accountResult = await pool.query(`
        SELECT id, password
        FROM accounts
        WHERE user_id = $1
          AND "providerId" = 'credential'
        LIMIT 1
      `, [existingUserId]);

      if (accountResult.rows.length > 0) {
        const account = accountResult.rows[0];

        if (!account.password || account.password.startsWith('$2')) {
          const passwordHash = await hashPassword(defaultPassword);

          await pool.query(`
            UPDATE accounts
            SET password = $1,
                "updatedAt" = $2
            WHERE id = $3
          `, [passwordHash, now, account.id]);

          console.log('🔁 Updated admin account to use Better Auth scrypt hashing.');
          console.log('\n📋 Root Admin Credentials:');
          console.log('   Email: root@authcore.local');
          console.log('   Password: AuthCore123!');
          console.log('\n⚠️  IMPORTANT: Change this password after first login!\n');
        } else {
          console.log('✅ Admin account already uses Better Auth-compatible hashing. No changes made.');
        }
      } else {
        const rootAccountId = generateId();
        const passwordHash = await hashPassword(defaultPassword);

        await pool.query(`
          INSERT INTO accounts (
            id, "accountId", "providerId", user_id, password, "createdAt", "updatedAt"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          rootAccountId,
          rootAccountId,
          'credential',
          existingUserId,
          passwordHash,
          now,
          now
        ]);

        console.log('✅ Created credential account for existing admin user.');
        console.log('\n📋 Root Admin Credentials:');
        console.log('   Email: root@authcore.local');
        console.log('   Password: AuthCore123!');
        console.log('\n⚠️  IMPORTANT: Change this password after first login!\n');
      }

      return;
    }

    const rootUserId = generateId();
    const rootAccountId = generateId();

    // Create root user in authcore_system schema
    await pool.query(`
      INSERT INTO users (
        id, email, name, "emailVerified", role, banned, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      rootUserId,
      'root@authcore.local',
      'Root Administrator',
      true,
      'admin', // Role admin for Better Auth admin plugin
      false,
      now,
      now
    ]);

    console.log('✅ Created root user');

    const passwordHash = await hashPassword(defaultPassword);

    await pool.query(`
      INSERT INTO accounts (
        id, "accountId", "providerId", user_id, password, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      rootAccountId,
      rootAccountId,
      'credential',
      rootUserId,
      passwordHash,
      now,
      now
    ]);

    console.log('✅ Created root account with default password');
    console.log('\n📋 Root Admin Credentials:');
    console.log('   Email: root@authcore.local');
    console.log('   Password: AuthCore123!');
    console.log('\n⚠️  IMPORTANT: Change this password after first login!\n');

    console.log('✅ Admin seeding completed successfully!');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seedAdminUser()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
