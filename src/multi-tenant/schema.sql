-- Multi-Tenant Registry Schema
-- This schema manages tenant metadata and application mappings
-- Updated: 2026-02-23 with all 18 improvements

-- 1. Tenants Table - Master registry of all tenants
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

-- Ensure existing environments include provisioning lifecycle states
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_status_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('active', 'suspended', 'deleted', 'provisioning', 'failed'));

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_schema ON public.tenants(schema_name);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);

-- 2. Applications Table - Track apps consuming auth service
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

-- 3. Tenant Audit Log - Track all tenant operations
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

-- 4. Sub-Tenants Table - Nested tenancy support
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

-- 5. Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create triggers for updated_at
DROP TRIGGER IF EXISTS update_tenants_updated_at ON public.tenants;
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_applications_updated_at ON public.applications;
CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. Audit log function
CREATE OR REPLACE FUNCTION log_tenant_action(
  p_tenant_id TEXT,
  p_action TEXT,
  p_actor TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.tenant_audit_log (tenant_id, action, actor, details, ip_address)
  VALUES (p_tenant_id, p_action, p_actor, p_details, p_ip_address);
END;
$$ LANGUAGE plpgsql;

-- 8. Insert initial tenants (only if not exists)
INSERT INTO public.tenants (id, name, slug, schema_name, status, metadata)
VALUES 
  ('pos', 'POS Kasir', 'pos-kasir', 'tenant_pos', 'active', '{"description": "Point of Sale system"}'),
  ('ticket', 'Ticketing System', 'ticketing', 'tenant_ticket', 'active', '{"description": "Event ticketing platform"}'),
  ('crypto', 'Crypto Exchange', 'crypto-exchange', 'tenant_crypto', 'active', '{"description": "Cryptocurrency exchange"}'),
  ('transity-core', 'TransityCore', 'transity-core', 'tenant_transity_core', 'active', '{"created_by": "system", "description": "Transit management system"}')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  schema_name = EXCLUDED.schema_name,
  metadata = EXCLUDED.metadata;

-- 9. Insert initial applications
INSERT INTO public.applications (id, tenant_id, name, description, domain, allowed_origins)
VALUES 
  ('app_pos_web', 'pos', 'POS Web App', 'Point of Sale web application', 'pos.yourcompany.com', 
   ARRAY['https://pos.yourcompany.com', 'http://localhost:3000']),
  ('app_ticket_web', 'ticket', 'Ticketing Web App', 'Event ticketing platform', 'tickets.yourcompany.com',
   ARRAY['https://tickets.yourcompany.com', 'http://localhost:3001']),
  ('app_crypto_web', 'crypto', 'Exchange Web App', 'Cryptocurrency exchange platform', 'exchange.yourcompany.com',
   ARRAY['https://exchange.yourcompany.com', 'http://localhost:3002'])
ON CONFLICT (id) DO NOTHING;

-- 10. Create authcore_system schema for admin authentication
CREATE SCHEMA IF NOT EXISTS authcore_system;

-- 11. Admin tables (authcore_system schema)
CREATE TABLE IF NOT EXISTS authcore_system.users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  name TEXT,
  image TEXT,
  role TEXT DEFAULT 'admin',
  "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS authcore_system.verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  UNIQUE(identifier, token)
);

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

CREATE TABLE IF NOT EXISTS authcore_system.invitation (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES authcore_system.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  inviter_id TEXT NOT NULL REFERENCES authcore_system.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS authcore_system.member (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES authcore_system.organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES authcore_system.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS authcore_system.verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Admin settings and audit
CREATE TABLE IF NOT EXISTS authcore_system.admin_settings (
  id INTEGER PRIMARY KEY,
  settings JSONB NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- 13. Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO realmio;
GRANT ALL ON ALL TABLES IN SCHEMA authcore_system TO realmio;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO realmio;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA authcore_system TO realmio;

-- 14. Admin users trigger
DROP TRIGGER IF EXISTS update_admin_users_updated_at ON authcore_system.users;
CREATE TRIGGER update_admin_users_updated_at
  BEFORE UPDATE ON authcore_system.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.tenants IS 'Master registry of all tenants with schema isolation';
COMMENT ON TABLE public.applications IS 'Applications that consume the auth service per tenant';
COMMENT ON TABLE public.tenant_audit_log IS 'Audit trail of all tenant operations';
COMMENT ON TABLE authcore_system.users IS 'Admin users for Realmio management';
COMMENT ON TABLE authcore_system.audit_actions IS 'Audit trail for all admin actions (Poin 6 improvement)';
