-- Add the missing Transity tenant to match your existing schema
INSERT INTO public.tenants (id, name, slug, schema_name, status) VALUES
  ('transity', 'Transity System', 'transity', 'tenant_transity', 'active')
ON CONFLICT (id) DO NOTHING;

-- Verify all tenants
SELECT id, name, slug, schema_name, status, created_at 
FROM public.tenants 
ORDER BY created_at;
