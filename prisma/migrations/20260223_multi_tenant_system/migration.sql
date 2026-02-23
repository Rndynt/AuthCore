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
-- ============================================

CREATE SCHEMA IF NOT EXISTS authcore_system;

-- Admin users table
CREATE TABLE IF NOT EXISTS authcore_system.users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  name TEXT,
  image TEXT,
  role TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin accounts table (for password auth)
CREATE TABLE IF NOT EXISTS authcore_system.accounts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES authcore_system.users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin sessions table
CREATE TABLE IF NOT EXISTS authcore_system.sessions (
  id TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES authcore_system.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON authcore_system.sessions(token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON authcore_system.sessions(user_id);

-- Admin verification tokens
CREATE TABLE IF NOT EXISTS authcore_system.verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  
  UNIQUE(identifier, token)
);

-- Admin organizations
CREATE TABLE IF NOT EXISTS authcore_system.organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  logo TEXT,
  metadata TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin organization members
CREATE TABLE IF NOT EXISTS authcore_system.organization_members (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES authcore_system.users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES authcore_system.organizations(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  invited_by TEXT,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, organization_id)
);

-- Admin invitations
CREATE TABLE IF NOT EXISTS authcore_system.invitation (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES authcore_system.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  inviter_id TEXT NOT NULL REFERENCES authcore_system.users(id) ON DELETE CASCADE
);

-- Admin member (simplified)
CREATE TABLE IF NOT EXISTS authcore_system.member (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES authcore_system.organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES authcore_system.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin verification
CREATE TABLE IF NOT EXISTS authcore_system.verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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

-- Triggers for admin users
DROP TRIGGER IF EXISTS update_admin_users_updated_at ON authcore_system.users;
CREATE TRIGGER update_admin_users_updated_at
  BEFORE UPDATE ON authcore_system.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 8. GRANT PERMISSIONS
-- ============================================

-- Grant permissions to realmio user (adjust as needed)
GRANT ALL ON ALL TABLES IN SCHEMA public TO realmio;
GRANT ALL ON ALL TABLES IN SCHEMA authcore_system TO realmio;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO realmio;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA authcore_system TO realmio;
