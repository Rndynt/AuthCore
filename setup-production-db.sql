-- ==============================================
-- Multi-Tenant Registry Schema Setup Script
-- Run this script on your Neon Production Database
-- ==============================================

-- 1. Create Tenants Table
CREATE TABLE IF NOT EXISTS public.tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  schema_name TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for tenants
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_schema ON public.tenants(schema_name);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);

-- 2. Create Applications Table
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

-- Create indexes for applications
CREATE INDEX IF NOT EXISTS idx_applications_tenant ON public.applications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_applications_api_key ON public.applications(api_key);

-- 3. Create Tenant Audit Log Table
CREATE TABLE IF NOT EXISTS public.tenant_audit_log (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT REFERENCES public.tenants(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor TEXT,
  details JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for audit log
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON public.tenant_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.tenant_audit_log(created_at DESC);

-- 4. Create Functions

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Audit log function
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

-- 5. Create Triggers

DROP TRIGGER IF EXISTS update_tenants_updated_at ON public.tenants;
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_applications_updated_at ON public.applications;
CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Insert Sample Data (Optional - modify as needed)

INSERT INTO public.tenants (id, name, slug, schema_name, status) VALUES
  ('pos', 'POS Kasir', 'pos-kasir', 'tenant_pos', 'active'),
  ('ticket', 'Ticketing System', 'ticketing', 'tenant_ticket', 'active'),
  ('crypto', 'Crypto Exchange', 'crypto-exchange', 'tenant_crypto', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.applications (id, tenant_id, name, description, domain, allowed_origins) VALUES
  ('app_pos_web', 'pos', 'POS Web App', 'Point of Sale web application', 'pos.yourcompany.com', 
   ARRAY['https://pos.yourcompany.com', 'http://localhost:3000']),
  ('app_ticket_web', 'ticket', 'Ticketing Web App', 'Event ticketing platform', 'tickets.yourcompany.com',
   ARRAY['https://tickets.yourcompany.com', 'http://localhost:3001']),
  ('app_crypto_web', 'crypto', 'Exchange Web App', 'Cryptocurrency exchange platform', 'exchange.yourcompany.com',
   ARRAY['https://exchange.yourcompany.com', 'http://localhost:3002'])
ON CONFLICT (id) DO NOTHING;

-- 7. Verify Installation

SELECT 'Tenants table ready with ' || COUNT(*) || ' records' as status FROM public.tenants;
SELECT 'Applications table ready with ' || COUNT(*) || ' records' as status FROM public.applications;
SELECT 'Setup completed successfully!' as status;
