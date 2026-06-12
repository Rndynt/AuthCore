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
  const re = /(?:import|from|require)\s*\(?['"]([^'"]+)['"]\)?/g;
  const out: string[] = []; let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

/** True if path references the old monolith src/ (not packages/core/src) */
function isMonolithSrcImport(i: string): boolean {
  // Allow packages/core/src (hexagonal core layer)
  if (/packages\/core\/src/.test(i) || /\/core\/src\//.test(i)) return false;
  // Ban direct references to old monolith directories
  return /\/src\/(admin|application|multi-tenant|server)\b/.test(i);
}

function rel(p: string) { return relative(ROOT, p); }

// ---------------------------------------------------------------------------
// Rule 1: packages/core — no src/ monolith or adapter imports
// ---------------------------------------------------------------------------
test('packages/core has no src/ monolith or adapter imports', () => {
  for (const file of collectTsFiles(join(ROOT, 'packages/core/src'))) {
    const v = importsOf(file).filter(i => isMonolithSrcImport(i) || i.includes('packages/adapters-'));
    assert.deepEqual(v, [], `${rel(file)}: ${v}`);
  }
});

// ---------------------------------------------------------------------------
// Rule 2: packages/http — no src/ monolith or adapter imports
// ---------------------------------------------------------------------------
test('packages/http has no src/ monolith or adapter imports', () => {
  for (const file of collectTsFiles(join(ROOT, 'packages/http/src'))) {
    const v = importsOf(file).filter(i => isMonolithSrcImport(i) || i.includes('packages/adapters-'));
    assert.deepEqual(v, [], `${rel(file)}: ${v}`);
  }
});

// ---------------------------------------------------------------------------
// Rule 3: netlify/functions — no direct src/ monolith imports
// ---------------------------------------------------------------------------
test('netlify/functions have no direct src/ monolith imports', () => {
  for (const file of collectTsFiles(join(ROOT, 'netlify/functions'))) {
    const v = importsOf(file).filter(
      i => isMonolithSrcImport(i) && !i.includes('apps/api') && !i.includes('server-netlify'),
    );
    assert.deepEqual(v, [], `${rel(file)}: ${v}`);
  }
});

// ---------------------------------------------------------------------------
// Rule 4: packages/server-fastify — no src/ monolith imports
//         (packages/core imports are OK — they are the domain layer)
// ---------------------------------------------------------------------------
test('packages/server-fastify has no src/ monolith imports', () => {
  for (const file of collectTsFiles(join(ROOT, 'packages/server-fastify/src'))) {
    const v = importsOf(file).filter(i => isMonolithSrcImport(i));
    assert.deepEqual(v, [], `${rel(file)}: ${v}`);
  }
});

// ---------------------------------------------------------------------------
// Rule 5: apps/api/src/container.ts — no direct src/ service singletons
// ---------------------------------------------------------------------------
test('apps/api/src/container.ts does not import src/ service singletons', () => {
  const v = importsOf(join(ROOT, 'apps/api/src/container.ts')).filter(
    i => i.includes('/src/admin/admin-api') || i.includes('/src/application/tenant-service') ||
         i.includes('/src/multi-tenant/auth-factory') || i.includes('/src/multi-tenant/connection-manager'),
  );
  assert.deepEqual(v, [], `container.ts: ${v}`);
});

// ---------------------------------------------------------------------------
// Rule 6: packages/core use cases — no adapter class imports
// ---------------------------------------------------------------------------
test('packages/core use cases do not import adapter classes', () => {
  const dirs = [
    'packages/core/src/application/tenant',   'packages/core/src/application/security',
    'packages/core/src/application/audit',     'packages/core/src/application/metrics',
    'packages/core/src/application/support-session', 'packages/core/src/application/webhook',
  ];
  for (const dir of dirs) {
    for (const file of collectTsFiles(join(ROOT, dir))) {
      const v = importsOf(file).filter(
        i => i.includes('adapters-postgres') || i.includes('adapters-better-auth') ||
             i.includes('adapters-runtime')  || isMonolithSrcImport(i),
      );
      assert.deepEqual(v, [], `${rel(file)}: ${v}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Rule 7: packages/sdk — no adapter or src/ monolith imports
// ---------------------------------------------------------------------------
test('packages/sdk has no adapter or src/ monolith imports', () => {
  for (const file of collectTsFiles(join(ROOT, 'packages/sdk/src'))) {
    const v = importsOf(file).filter(i => i.includes('packages/adapters-') || isMonolithSrcImport(i));
    assert.deepEqual(v, [], `${rel(file)}: ${v}`);
  }
});
