import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTenant } from '../packages/http/src/tenant-resolver.js';
const registry = { initialize: async()=>{}, getTenant: (id:string)=>undefined, getAllTenants:()=>[], registerTenant: async()=>{}, removeTenant: async()=>{}, resolveTenant: (id: string) => id === 'acme' ? { id: 'acme', slug: 'acme', name: 'Acme', status: 'active', schemaName: 'tenant_acme', metadata: {}, createdAt: new Date(), updatedAt: new Date() } : undefined };

test('tenant resolver supports header path and subdomain', () => {
  assert.equal((resolveTenant({ headers: new Headers({ 'X-Tenant-Id': 'acme' }), pathname: '/api/auth/get-session' }, registry) as any).tenantId, 'acme');
  assert.equal((resolveTenant({ headers: new Headers(), pathname: '/tenant/acme/api/auth/get-session' }, registry) as any).tenantId, 'acme');
  assert.equal((resolveTenant({ headers: new Headers({ host: 'acme.example.com' }), pathname: '/api/auth/get-session' }, registry) as any).tenantId, 'acme');
});

test('tenant resolver returns stable error codes', () => {
  assert.equal((resolveTenant({ headers: new Headers(), pathname: '/api/auth' }, registry) as any).error, 'TENANT_REQUIRED');
  assert.equal((resolveTenant({ headers: new Headers({ 'X-Tenant-Id': '-bad' }), pathname: '/api/auth' }, registry) as any).error, 'TENANT_INVALID');
  assert.equal((resolveTenant({ headers: new Headers({ 'X-Tenant-Id': 'missing' }), pathname: '/api/auth' }, registry) as any).error, 'TENANT_NOT_FOUND');
});
