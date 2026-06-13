/**
 * Architecture Boundary Tests — Node built-in test runner
 * Run: node --import tsx --test tests/architecture-boundaries.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!statSync(dir, { throwIfNoEntry: false })) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...collectTsFiles(full));
    else if (e.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function importsOf(file: string): string[] {
  const src = readFileSync(file, 'utf-8');
  const re = /(?:^|\s)(?:import|from|export)\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/gm;
  const out: string[] = []; let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

/**
 * Returns true only for imports from OLD monolith src directories.
 * Packages-layer and apps-layer paths are allowed (not legacy).
 */
function isLegacyMonolithImport(i: string): boolean {
  // Allow any packages/ path (packages/core/src, packages/config/src, etc.)
  if (/packages\//.test(i)) return false;
  // Allow apps/api/src (composition root)
  if (/apps\/api\/src/.test(i)) return false;
  // Ban plain src/ monolith directories (not under packages/)
  // Matches paths like '../../../src/admin/...' or '../../src/multi-tenant/...'
  return /\.\.\/src\/(admin|application|multi-tenant|utils\/|server\b)/.test(i) ||
    /\.\.\/src\/env\./.test(i) ||
    /\.\.\/src\/config\//.test(i);
}

function rel(p: string) { return relative(ROOT, p); }

// ---------------------------------------------------------------------------
// Rule 1: packages/core — no legacy or adapter imports
// ---------------------------------------------------------------------------
test('packages/core has no legacy src/ or adapter imports', () => {
  for (const file of collectTsFiles(join(ROOT, 'packages/core/src'))) {
    const v = importsOf(file).filter(
      i => isLegacyMonolithImport(i) || /packages\/adapters-/.test(i)
    );
    assert.deepEqual(v, [], `${rel(file)}: ${v}`);
  }
});

// ---------------------------------------------------------------------------
// Rule 2: packages/http — no legacy src/ or adapter imports
// ---------------------------------------------------------------------------
test('packages/http has no legacy src/ or adapter imports', () => {
  for (const file of collectTsFiles(join(ROOT, 'packages/http/src'))) {
    const v = importsOf(file).filter(
      i => isLegacyMonolithImport(i) || /packages\/adapters-/.test(i)
    );
    assert.deepEqual(v, [], `${rel(file)}: ${v}`);
  }
});

// ---------------------------------------------------------------------------
// Rule 3: netlify/functions — no direct legacy monolith imports
//   (apps/api/src and packages/ are allowed)
// ---------------------------------------------------------------------------
test('netlify/functions have no direct legacy monolith imports', () => {
  for (const file of collectTsFiles(join(ROOT, 'netlify/functions'))) {
    const v = importsOf(file).filter(i => isLegacyMonolithImport(i));
    assert.deepEqual(v, [], `${rel(file)}: ${v}`);
  }
});

// ---------------------------------------------------------------------------
// Rule 4: packages/server-fastify — no legacy src/ imports
// ---------------------------------------------------------------------------
test('packages/server-fastify has no legacy src/ imports', () => {
  for (const file of collectTsFiles(join(ROOT, 'packages/server-fastify/src'))) {
    const v = importsOf(file).filter(i => isLegacyMonolithImport(i));
    assert.deepEqual(v, [], `${rel(file)}: ${v}`);
  }
});

// ---------------------------------------------------------------------------
// Rule 5: apps/api/src/container.ts — no legacy src/ singletons
// ---------------------------------------------------------------------------
test('apps/api/src/container.ts uses packages layer only', () => {
  const v = importsOf(join(ROOT, 'apps/api/src/container.ts')).filter(
    i => /\/src\/admin\//.test(i) || /\/src\/application\//.test(i) ||
         /\/src\/multi-tenant\//.test(i) || /[^/]\/src\/utils\//.test(i) ||
         /[^/]\/src\/env\b/.test(i)
  ).filter(i => !/packages\//.test(i) && !/apps\/api\/src/.test(i));
  assert.deepEqual(v, [], `container.ts legacy: ${v}`);
});

// ---------------------------------------------------------------------------
// Rule 6: packages/core use cases — no adapter class imports
// ---------------------------------------------------------------------------
test('packages/core use cases do not import adapter classes', () => {
  for (const dir of [
    'packages/core/src/application/tenant',
    'packages/core/src/application/security',
    'packages/core/src/application/audit',
    'packages/core/src/application/metrics',
    'packages/core/src/application/support-session',
    'packages/core/src/application/webhook',
  ]) {
    for (const file of collectTsFiles(join(ROOT, dir))) {
      const v = importsOf(file).filter(
        i => /adapters-postgres/.test(i) || /adapters-better-auth/.test(i) ||
             /adapters-runtime/.test(i) || isLegacyMonolithImport(i)
      );
      assert.deepEqual(v, [], `${rel(file)}: ${v}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Rule 7: packages/sdk — no adapter or legacy imports
// ---------------------------------------------------------------------------
test('packages/sdk has no adapter or legacy src/ imports', () => {
  for (const file of collectTsFiles(join(ROOT, 'packages/sdk/src'))) {
    const v = importsOf(file).filter(
      i => /packages\/adapters-/.test(i) || isLegacyMonolithImport(i)
    );
    assert.deepEqual(v, [], `${rel(file)}: ${v}`);
  }
});

// ---------------------------------------------------------------------------
// P06 Rule 8: packages/adapters-better-auth must not import src/admin/* or src/multi-tenant/*
// ---------------------------------------------------------------------------
test('packages/adapters-better-auth does not import legacy src/admin or src/multi-tenant', () => {
  for (const file of collectTsFiles(join(ROOT, 'packages/adapters-better-auth/src'))) {
    const v = importsOf(file).filter(
      i => /\/src\/admin\//.test(i) || /\/src\/multi-tenant\//.test(i)
    ).filter(i => !/packages\//.test(i));
    assert.deepEqual(v, [], `${rel(file)}: ${v}`);
  }
});

// ---------------------------------------------------------------------------
// P06 Rule 9: packages/adapters-runtime must not import src/multi-tenant/* or src/utils/*
// ---------------------------------------------------------------------------
test('packages/adapters-runtime does not import legacy src/multi-tenant or src/utils', () => {
  for (const file of collectTsFiles(join(ROOT, 'packages/adapters-runtime/src'))) {
    const v = importsOf(file).filter(
      i => /\/src\/multi-tenant\//.test(i) || /[^/]\/src\/utils\//.test(i)
    ).filter(i => !/packages\//.test(i));
    assert.deepEqual(v, [], `${rel(file)}: ${v}`);
  }
});

// ---------------------------------------------------------------------------
// P06 Rule 10: apps/api/src/config.ts imports from packages/config, not src/
// ---------------------------------------------------------------------------
test('apps/api/src/config.ts imports from packages/config, not src/', () => {
  const v = importsOf(join(ROOT, 'apps/api/src/config.ts')).filter(
    i => /[^/]\/src\/env\b/.test(i) || /[^/]\/src\/config\//.test(i)
  ).filter(i => !/packages\//.test(i));
  assert.deepEqual(v, [], `config.ts legacy: ${v}`);
});

// ---------------------------------------------------------------------------
// P06 Rule 11–12: deleted files must not exist
// ---------------------------------------------------------------------------
test('src/admin/admin-api.ts has been deleted', () => {
  const exists = statSync(join(ROOT, 'src/admin/admin-api.ts'), { throwIfNoEntry: false });
  assert.equal(exists, undefined, 'src/admin/admin-api.ts must not exist');
});

test('src/admin/routes.ts has been deleted', () => {
  const exists = statSync(join(ROOT, 'src/admin/routes.ts'), { throwIfNoEntry: false });
  assert.equal(exists, undefined, 'src/admin/routes.ts must not exist');
});

test('src/application/tenant-service.ts has been deleted', () => {
  const exists = statSync(join(ROOT, 'src/application/tenant-service.ts'), { throwIfNoEntry: false });
  assert.equal(exists, undefined, 'src/application/tenant-service.ts must not exist');
});
