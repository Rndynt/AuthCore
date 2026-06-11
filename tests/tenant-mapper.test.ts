import test from 'node:test';
import assert from 'node:assert/strict';
import { tenantDomainToLegacy, tenantRowToDomain } from '../packages/adapters-postgres/src/mappers/tenant.mapper.js';

test('tenant mapper isolates snake_case rows from camelCase domain', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const domain = tenantRowToDomain({ id: 'acme', name: 'Acme', slug: 'acme', schema_name: 'tenant_acme', status: 'active', metadata: null, created_at: now, updated_at: now });
  assert.deepEqual(domain, { id: 'acme', name: 'Acme', slug: 'acme', schemaName: 'tenant_acme', status: 'active', metadata: {}, createdAt: now, updatedAt: now });
  assert.equal(tenantDomainToLegacy(domain).schema_name, 'tenant_acme');
});
