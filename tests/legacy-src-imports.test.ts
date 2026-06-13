/**
 * Legacy src/ Import Scan Test — P06
 *
 * Scans all TypeScript source files outside src/ and asserts that
 * none import from the legacy monolith src/ directories.
 * 
 * Deliberately excludes:
 *   - src/ itself (shims are allowed to re-export)
 *   - node_modules, dist, .next, admin-ui/out, lockfiles
 *   - tests/ (may reference src/ for shim path checks)
 *
 * Run: node --import tsx --test tests/legacy-src-imports.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const SCAN_DIRS = [
  'apps',
  'packages/adapters-better-auth/src',
  'packages/adapters-postgres/src',
  'packages/adapters-runtime/src',
  'packages/core/src',
  'packages/http/src',
  'packages/server-fastify/src',
  'packages/server-netlify/src',
  'packages/sdk/src',
  'packages/config/src',
  'netlify/functions',
];

const FORBIDDEN_PATTERNS = [
  /['"].*\/src\/admin\/(auth|admin-api|routes)/,
  /['"].*\/src\/application\/tenant-service/,
  /['"].*\/src\/multi-tenant\/(auth-factory|connection-manager)/,
  /['"].*\/src\/utils\/(log-stream|metrics-store|webhook|ip-utils)/,
];

function collectTsFiles(dir: string): string[] {
  const full = join(ROOT, dir);
  if (!statSync(full, { throwIfNoEntry: false })) return [];
  const out: string[] = [];
  function walk(d: string) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts')) out.push(p);
    }
  }
  walk(full);
  return out;
}

function findForbiddenImports(file: string): string[] {
  const src = readFileSync(file, 'utf-8');
  return FORBIDDEN_PATTERNS
    .filter(pat => pat.test(src))
    .map(pat => pat.toString());
}

// One test per scan directory for clear failure scoping
for (const dir of SCAN_DIRS) {
  test(`${dir} — no direct legacy src/ runtime imports`, () => {
    const files = collectTsFiles(dir);
    const violations: string[] = [];
    for (const file of files) {
      const hits = findForbiddenImports(file);
      if (hits.length > 0) {
        violations.push(`${relative(ROOT, file)}: ${hits.join(', ')}`);
      }
    }
    assert.deepEqual(violations, [], `Legacy import violations found:\n${violations.join('\n')}`);
  });
}
