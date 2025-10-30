import pkg from 'pg';
const { Pool } = pkg;
import { createHash, randomBytes } from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Simple password hashing (for demo - use bcrypt in production)
function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

function generateId(): string {
  return randomBytes(16).toString('hex');
}

async function seedAdminUser() {
  try {
    console.log('🌱 Seeding admin users to authcore_system schema...\n');

    // Check if root already exists
    const existing = await pool.query(`
      SELECT id FROM authcore_system.users WHERE email = $1
    `, ['root@authcore.local']);

    if (existing.rows.length > 0) {
      console.log('⚠️  Root admin already exists, skipping...');
      return;
    }

    const rootUserId = generateId();
    const rootAccountId = generateId();
    const now = new Date();

    // Create root user
    await pool.query(`
      INSERT INTO authcore_system.users (
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

    // Create account with password (default: AuthCore123!)
    const defaultPassword = 'AuthCore123!';
    const passwordHash = hashPassword(defaultPassword);

    await pool.query(`
      INSERT INTO authcore_system.accounts (
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
