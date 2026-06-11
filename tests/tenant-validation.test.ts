import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTenantSchemaName, normalizeTenantIdentifier, validateSchemaName } from '../packages/core/src/domain/tenant/tenant-validation.js';

test('tenant validation normalizes ids and builds schema names', () => {
  assert.equal(normalizeTenantIdentifier(' Acme_01 ', 'id'), 'acme_01');
  assert.equal(buildTenantSchemaName('Acme-01'), 'tenant_acme_01');
  assert.equal(validateSchemaName('tenant_acme_01'), 'tenant_acme_01');
});

test('tenant validation rejects invalid ids and schema names', () => {
  assert.throws(() => normalizeTenantIdentifier('-bad', 'id'), /id must/);
  assert.throws(() => validateSchemaName('1bad'), /schema name/);
});
