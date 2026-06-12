import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ActivateTenantUseCase,
  CreateTenantUseCase,
  DeleteTenantUseCase,
  ListTenantsUseCase,
  GetTenantUseCase,
  SuspendTenantUseCase,
} from '../packages/core/src/application/tenant/tenant-use-cases.js';

// ---------------------------------------------------------------------------
// Fake deps factory
// ---------------------------------------------------------------------------

function makeDeps() {
  const tenants: any[] = [];
  const events: any[] = [];
  let provisioned: string[] = [];

  const tenantRepository = {
    listTenants: async () => [...tenants],
    getTenant: async (id: string) => tenants.find(t => t.id === id) ?? null,

    // P02: two-step lifecycle
    createProvisioningTenant: async (input: any) => {
      const t = {
        id: input.id,
        name: input.name,
        slug: input.slug,
        schemaName: input.schemaName,
        status: 'provisioning',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      tenants.push(t);
      return t;
    },
    markTenantActive: async (id: string) => {
      const t = tenants.find(x => x.id === id);
      if (!t) throw new Error(`Tenant not found: ${id}`);
      t.status = 'active';
      return t;
    },

    // Legacy path — kept for backward compat
    createTenant: async (input: any) => {
      const t = {
        id: input.id,
        name: input.name,
        slug: input.slug,
        schemaName: input.schemaName,
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      tenants.push(t);
      return t;
    },
    updateTenantStatus: async (id: string, status: any) => {
      const t = tenants.find(x => x.id === id);
      if (!t) return null;
      t.status = status;
      return t;
    },
    getTenantStatusSnapshot: async () => tenants.map(t => ({ id: t.id, status: t.status })),
  };

  // P02: schema provisioner port
  const tenantSchemaProvisioner = {
    provisionTenantSchema: async (tenant: any) => {
      provisioned.push(tenant.id);
    },
  };

  const tenantRegistry = {
    initialize:      async () => {},
    resolveTenant:   (id: string) => tenants.find(t => t.id === id),
    getTenant:       (id: string) => tenants.find(t => t.id === id),
    getAllTenants:    () => [...tenants],
    registerTenant:  async (t: any) => {
      const i = tenants.findIndex(x => x.id === t.id);
      if (i >= 0) tenants[i] = t; else tenants.push(t);
    },
    removeTenant:    async () => {},
  };

  const authCache = {
    clearTenant: (_: string) => {},
    clearAll:    () => {},
    getStats:    () => ({}),
  };

  const eventPublisher = {
    publish: async (event: string, payload: unknown) => { events.push({ event, payload }); },
  };

  return { tenants, events, provisioned, tenantRepository, tenantSchemaProvisioner, tenantRegistry, authCache, eventPublisher };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('CreateTenantUseCase: normalises identifiers, provisions schema, marks active', async () => {
  const d = makeDeps();
  const uc = new CreateTenantUseCase(d);

  const tenant = await uc.execute({ id: 'Acme-01', name: 'Acme Corp', slug: 'Acme' });

  assert.equal(tenant.id,         'acme-01',        'id is lowercased');
  assert.equal(tenant.slug,       'acme',           'slug is lowercased');
  assert.equal(tenant.schemaName, 'tenant_acme_01', 'schemaName is derived from id');
  assert.equal(tenant.status,     'active',         'tenant ends up active');

  assert.deepEqual(d.provisioned, ['acme-01'], 'schema was provisioned exactly once');
  assert.equal(d.events[0]?.event, 'tenant.created', 'created event published');
});

test('CreateTenantUseCase: calls provisioner before markTenantActive', async () => {
  const d = makeDeps();
  const calls: string[] = [];

  d.tenantSchemaProvisioner.provisionTenantSchema = async (t: any) => { calls.push('provision'); };
  const origMark = d.tenantRepository.markTenantActive;
  d.tenantRepository.markTenantActive = async (id: string) => { calls.push('markActive'); return origMark(id); };

  await new CreateTenantUseCase(d).execute({ id: 'demo', name: 'Demo', slug: 'demo' });

  assert.deepEqual(calls, ['provision', 'markActive'], 'provision happens before markActive');
});

test('ListTenantsUseCase: returns all tenants from repository', async () => {
  const d = makeDeps();
  await new CreateTenantUseCase(d).execute({ id: 'a', name: 'A', slug: 'a' });
  await new CreateTenantUseCase(d).execute({ id: 'b', name: 'B', slug: 'b' });

  const list = await new ListTenantsUseCase(d).execute();
  assert.equal(list.length, 2);
});

test('GetTenantUseCase: returns null for unknown tenant', async () => {
  const d = makeDeps();
  const result = await new GetTenantUseCase(d).execute('nonexistent');
  assert.equal(result, null);
});

test('Lifecycle use cases: suspend → activate → delete update status', async () => {
  const d = makeDeps();
  await new CreateTenantUseCase(d).execute({ id: 'acme', name: 'Acme', slug: 'acme' });

  await new SuspendTenantUseCase(d).execute('acme');
  assert.equal(d.tenants[0].status, 'suspended');

  await new ActivateTenantUseCase(d).execute('acme');
  assert.equal(d.tenants[0].status, 'active');

  await new DeleteTenantUseCase(d).execute('acme');
  assert.equal(d.tenants[0].status, 'deleted');
});

test('Lifecycle use cases: publish domain events', async () => {
  const d = makeDeps();
  await new CreateTenantUseCase(d).execute({ id: 'evt', name: 'Evt', slug: 'evt' });
  await new SuspendTenantUseCase(d).execute('evt');
  await new ActivateTenantUseCase(d).execute('evt');
  await new DeleteTenantUseCase(d).execute('evt');

  const eventNames = d.events.map((e: any) => e.event);
  assert.ok(eventNames.includes('tenant.created'));
  assert.ok(eventNames.includes('tenant.suspended'));
  assert.ok(eventNames.includes('tenant.activated'));
  assert.ok(eventNames.includes('tenant.deleted'));
});
