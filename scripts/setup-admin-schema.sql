-- Setup authcore_system schema for admin authentication
-- This schema is completely isolated from tenant schemas
-- NOTE: Column names use camelCase to match Prisma-generated schema

-- 1. Create schema
CREATE SCHEMA IF NOT EXISTS authcore_system;

-- 2. Create Better Auth tables with Prisma-compatible column names (camelCase)

-- Admin users table (matches Prisma User model with @@map("users"))
CREATE TABLE IF NOT EXISTS authcore_system.users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  name TEXT,
  image TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  role TEXT DEFAULT 'admin',
  banned BOOLEAN DEFAULT false,
  "banReason" TEXT,
  "banExpires" TIMESTAMP(3)
);

-- Admin accounts table (matches Prisma Account model with @@map("accounts"))
CREATE TABLE IF NOT EXISTS authcore_system.accounts (
  id TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES authcore_system.users(id) ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "refreshTokenExpiresAt" TIMESTAMP(3),
  scope TEXT,
  password TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Admin sessions table (matches Prisma Session model with @@map("sessions"))
CREATE TABLE IF NOT EXISTS authcore_system.sessions (
  id TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  token TEXT UNIQUE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  user_id TEXT NOT NULL REFERENCES authcore_system.users(id) ON DELETE CASCADE,
  "impersonatedBy" TEXT,
  "activeOrganizationId" TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON authcore_system.sessions(token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON authcore_system.sessions(user_id);

-- Admin verification table (matches Prisma Verification model with @@map("verification"))
CREATE TABLE IF NOT EXISTS authcore_system.verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Admin organizations table (matches Prisma Organization model with @@map("organizations"))
CREATE TABLE IF NOT EXISTS authcore_system.organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  logo TEXT,
  metadata TEXT
);

-- Admin member table (matches Prisma Member model with @@map("member"))
CREATE TABLE IF NOT EXISTS authcore_system.member (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES authcore_system.organizations(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES authcore_system.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Admin invitation table (matches Prisma Invitation model with @@map("invitation"))
CREATE TABLE IF NOT EXISTS authcore_system.invitation (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES authcore_system.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "inviterId" TEXT NOT NULL REFERENCES authcore_system.users(id) ON DELETE CASCADE
);

-- Admin API keys table (matches Prisma Apikey model with @@map("apikey"))
CREATE TABLE IF NOT EXISTS authcore_system.apikey (
  id TEXT PRIMARY KEY,
  name TEXT,
  start TEXT,
  prefix TEXT,
  key TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES authcore_system.users(id) ON DELETE CASCADE,
  "refillInterval" INTEGER,
  "refillAmount" INTEGER,
  "lastRefillAt" TIMESTAMP(3),
  enabled BOOLEAN DEFAULT true,
  "rateLimitEnabled" BOOLEAN DEFAULT true,
  "rateLimitTimeWindow" INTEGER,
  "rateLimitMax" INTEGER,
  "requestCount" INTEGER,
  remaining INTEGER,
  "lastRequest" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  permissions TEXT,
  metadata TEXT
);

-- Admin JWKS table (matches Prisma Jwks model with @@map("jwks"))
CREATE TABLE IF NOT EXISTS authcore_system.jwks (
  id TEXT PRIMARY KEY,
  "publicKey" TEXT NOT NULL,
  "privateKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Admin two-factor table (matches Prisma TwoFactor model with @@map("two_factor"))
CREATE TABLE IF NOT EXISTS authcore_system.two_factor (
  id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES authcore_system.users(id) ON DELETE CASCADE
);

-- 3. Create audit table for admin actions
CREATE TABLE IF NOT EXISTS authcore_system.audit_actions (
  id SERIAL PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_audit_admin ON authcore_system.audit_actions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON authcore_system.audit_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target ON authcore_system.audit_actions(target_type, target_id);

-- 5. Add comments
COMMENT ON SCHEMA authcore_system IS 'Admin authentication and management schema - isolated from tenant data';
COMMENT ON TABLE authcore_system.audit_actions IS 'Audit log for all admin actions on tenants and system';
COMMENT ON TABLE authcore_system.users IS 'Admin users - completely separate from tenant users';

-- Success message
SELECT 'authcore_system schema setup completed successfully!' as status;
