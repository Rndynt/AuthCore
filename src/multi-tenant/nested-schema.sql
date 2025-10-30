-- Nested Tenancy Schema Extensions
-- This schema adds support for sub-tenants within applications
-- Only needed when NESTED_TENANCY_ENABLED=true

-- 1. Extend applications table with isolation mode
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS isolation_mode TEXT DEFAULT 'organization' 
  CHECK (isolation_mode IN ('schema', 'organization')),
ADD COLUMN IF NOT EXISTS parent_application_id TEXT REFERENCES public.applications(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';

COMMENT ON COLUMN public.applications.isolation_mode IS 
  'Data isolation mode: "schema" for strict isolation, "organization" for org-based isolation';

-- 2. Sub-tenants table for nested multi-tenancy
CREATE TABLE IF NOT EXISTS public.application_sub_tenants (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  organization_id TEXT,  -- Better Auth organization ID (for org-based isolation)
  isolation_mode TEXT DEFAULT 'organization' CHECK (isolation_mode IN ('schema', 'organization')),
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(application_id, slug)
);

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sub_tenants_application ON public.application_sub_tenants(application_id);
CREATE INDEX IF NOT EXISTS idx_sub_tenants_slug ON public.application_sub_tenants(slug);
CREATE INDEX IF NOT EXISTS idx_sub_tenants_status ON public.application_sub_tenants(status);
CREATE INDEX IF NOT EXISTS idx_sub_tenants_org ON public.application_sub_tenants(organization_id) WHERE organization_id IS NOT NULL;

-- 4. Update trigger for updated_at
DROP TRIGGER IF EXISTS update_sub_tenants_updated_at ON public.application_sub_tenants;
CREATE TRIGGER update_sub_tenants_updated_at
  BEFORE UPDATE ON public.application_sub_tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Example data for testing nested tenancy
INSERT INTO public.application_sub_tenants (id, application_id, name, slug, isolation_mode) VALUES
  ('pos_cafe_a', 'app_pos_web', 'Cafe A', 'cafe-a', 'organization'),
  ('pos_cafe_b', 'app_pos_web', 'Cafe B', 'cafe-b', 'organization'),
  ('pos_resto_c', 'app_pos_web', 'Restaurant C', 'resto-c', 'organization')
ON CONFLICT (application_id, slug) DO NOTHING;

COMMENT ON TABLE public.application_sub_tenants IS 
  'Sub-tenants within applications for nested multi-tenancy support';
