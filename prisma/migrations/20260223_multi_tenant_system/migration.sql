-- Multi-Tenant System Migration
-- Creates tables for tenant management and admin system

-- ============================================
-- 1. TENANT REGISTRY (public schema)
-- ============================================

CREATE TABLE IF NOT EXISTS public.tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  schema_name TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted', 'provisioning', 'failed')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_schema ON public.tenants(schema_name);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);

-- ============================================
-- 2. APPLICATIONS (public schema)
-- ============================================

CREATE TABLE IF NOT EXISTS public.applications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  domain TEXT,
  api_key TEXT UNIQUE,
  allowed_origins TEXT[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_applications_tenant ON public.applications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_applications_api_key ON public.applications(api_key);

-- ============================================
-- 3. TENANT AUDIT LOG (public schema)
-- ============================================

CREATE TABLE IF NOT EXISTS public.tenant_audit_log (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT REFERENCES public.tenants(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor TEXT,
  details JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON public.tenant_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.tenant_audit_log(created_at DESC);

-- ============================================
-- 4. ADMIN SYSTEM SCHEMA
-- NOTE: Column names use camelCase to match Prisma-generated schema
-- ============================================

CREATE SCHEMA IF NOT EXISTS authcore_system;

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

-- ============================================
-- 5. ADMIN SETTINGS & AUDIT (authcore_system)
-- ============================================

-- Admin settings
CREATE TABLE IF NOT EXISTS authcore_system.admin_settings (
  id INTEGER PRIMARY KEY,
  settings JSONB NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin audit actions (Poin 6: Audit trail for admin actions)
CREATE TABLE IF NOT EXISTS authcore_system.audit_actions (
  id SERIAL PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_actions_admin ON authcore_system.audit_actions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_actions_created ON authcore_system.audit_actions(created_at DESC);

-- ============================================
-- 6. SUB-TENANTS (for nested tenancy)
-- ============================================

CREATE TABLE IF NOT EXISTS public.application_sub_tenants (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  organization_id TEXT,
  isolation_mode TEXT DEFAULT 'schema' CHECK (isolation_mode IN ('schema', 'organization')),
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(application_id, slug)
);

-- ============================================
-- 7. FUNCTIONS & TRIGGERS
-- ============================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for tenants
DROP TRIGGER IF EXISTS update_tenants_updated_at ON public.tenants;
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Triggers for applications
DROP TRIGGER IF EXISTS update_applications_updated_at ON public.applications;
CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 8. GRANT PERMISSIONS
-- ============================================

-- Grant permissions to realmio user (adjust as needed)
GRANT ALL ON ALL TABLES IN SCHEMA public TO realmio;
GRANT ALL ON ALL TABLES IN SCHEMA authcore_system TO realmio;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO realmio;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA authcore_system TO realmio;
