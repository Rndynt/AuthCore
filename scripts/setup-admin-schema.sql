-- Setup authcore_system schema for admin authentication
-- This schema is completely isolated from tenant schemas

-- 1. Create schema
CREATE SCHEMA IF NOT EXISTS authcore_system;

-- 2. Create Better Auth tables (copy structure from public)
CREATE TABLE IF NOT EXISTS authcore_system.users (LIKE public.users INCLUDING ALL);
CREATE TABLE IF NOT EXISTS authcore_system.accounts (LIKE public.accounts INCLUDING ALL);
CREATE TABLE IF NOT EXISTS authcore_system.sessions (LIKE public.sessions INCLUDING ALL);
CREATE TABLE IF NOT EXISTS authcore_system.verificationtokens (LIKE public.verificationtokens INCLUDING ALL);
CREATE TABLE IF NOT EXISTS authcore_system.organizations (LIKE public.organizations INCLUDING ALL);
CREATE TABLE IF NOT EXISTS authcore_system.organization_members (LIKE public.organization_members INCLUDING ALL);
CREATE TABLE IF NOT EXISTS authcore_system.verification (LIKE public.verification INCLUDING ALL);
CREATE TABLE IF NOT EXISTS authcore_system.member (LIKE public.member INCLUDING ALL);
CREATE TABLE IF NOT EXISTS authcore_system.invitation (LIKE public.invitation INCLUDING ALL);
CREATE TABLE IF NOT EXISTS authcore_system.apikey (LIKE public.apikey INCLUDING ALL);
CREATE TABLE IF NOT EXISTS authcore_system.jwks (LIKE public.jwks INCLUDING ALL);

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
