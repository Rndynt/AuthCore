import test from 'node:test';
import assert from 'node:assert/strict';
import { RealmioAdminClient, RealmioApiError, RealmioTenantAuthClient } from '../packages/sdk/src/index.js';

test('admin SDK builds requests and parses responses', async () => {
  const calls: any[] = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ tenants: [] }), { status: 200 });
  }) as any;
  const client = new RealmioAdminClient({ baseUrl: 'https://auth.example.com', credentials: 'include', fetch: fetchImpl });
  await client.tenants.list();
  assert.equal(calls[0].url, 'https://auth.example.com/admin/api/tenants');
  assert.equal(calls[0].init.credentials, 'include');
});

test('tenant SDK sends X-Tenant-Id and SDK errors include status/code/body', async () => {
  const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    assert.equal((init!.headers as any)['X-Tenant-Id'], 'nusa');
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED', message: 'nope', details: { a: 1 } }), { status: 401 });
  }) as any;
  const auth = new RealmioTenantAuthClient({ baseUrl: 'https://auth.example.com', tenantId: 'nusa', fetch: fetchImpl });
  await assert.rejects(() => auth.session.get(), (err: any) => err instanceof RealmioApiError && err.status === 401 && err.code === 'UNAUTHORIZED');
});
