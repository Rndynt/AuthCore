import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivateTenantUseCase, CreateTenantUseCase, DeleteTenantUseCase, SuspendTenantUseCase } from '../packages/core/src/application/tenant/tenant-use-cases.js';

function deps() {
  const tenants: any[] = [];
  const events: any[] = [];
  return {
    tenants,
    events,
    tenantRepository: {
      listTenants: async () => tenants,
      getTenant: async (id: string) => tenants.find(t => t.id === id) ?? null,
      createTenant: async (input: any) => { const t = { id: input.id, name: input.name, slug: input.slug, schemaName: input.schemaName, status: 'active', metadata: {}, createdAt: new Date(), updatedAt: new Date() }; tenants.push(t); return t; },
      updateTenantStatus: async (id: string, status: any) => { const t = tenants.find(x => x.id === id); if (!t) return null; t.status = status; return t; },
      getTenantStatusSnapshot: async () => tenants.map(t => ({ id: t.id, status: t.status })),
    },
    tenantRegistry: { initialize: async()=>{}, resolveTenant: (id:string)=>tenants.find(t=>t.id===id), getTenant: (id:string)=>tenants.find(t=>t.id===id), getAllTenants:()=>tenants, registerTenant: async (t:any)=>{ const i=tenants.findIndex(x=>x.id===t.id); if(i>=0) tenants[i]=t; else tenants.push(t); }, removeTenant: async()=>{} },
    authCache: { clearTenant: (_: string) => {}, clearAll: () => {}, getStats: () => ({}) },
    eventPublisher: { publish: async (event: string, payload: unknown) => { events.push({ event, payload }); } },
  };
}

test('create tenant use case uses ports and normalizes input', async () => {
  const d = deps();
  const tenant = await new CreateTenantUseCase(d).execute({ id: 'Acme-01', name: 'Acme', slug: 'Acme' });
  assert.equal(tenant.id, 'acme-01');
  assert.equal(tenant.schemaName, 'tenant_acme_01');
  assert.equal(d.events[0].event, 'tenant.created');
});

test('tenant status use cases update via repository and registry ports', async () => {
  const d = deps();
  await new CreateTenantUseCase(d).execute({ id: 'acme', name: 'Acme', slug: 'acme' });
  await new SuspendTenantUseCase(d).execute('acme');
  assert.equal(d.tenants[0].status, 'suspended');
  await new ActivateTenantUseCase(d).execute('acme');
  assert.equal(d.tenants[0].status, 'active');
  await new DeleteTenantUseCase(d).execute('acme');
  assert.equal(d.tenants[0].status, 'deleted');
});
