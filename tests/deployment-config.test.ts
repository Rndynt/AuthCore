/**
 * Deployment Configuration Invariant Tests
 *
 * Reads deployment files as text and asserts structural invariants.
 * Catches regressions where Dockerfile, compose, or next.config drift
 * back to the old two-service model.
 *
 * Run: node --import tsx --test tests/deployment-config.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf-8');

// ---------------------------------------------------------------------------
// docker-compose.yml
// ---------------------------------------------------------------------------

test('docker-compose.yml: no admin-ui service', () => {
  const src = read('docker-compose.yml');
  assert.ok(!src.includes('admin-ui:'), 'Found "admin-ui:" service — must be removed');
});

test('docker-compose.yml: no port 3000', () => {
  const src = read('docker-compose.yml');
  assert.ok(!src.includes('3000:3000'), 'Found port 3000:3000 — admin-ui standalone port must be removed');
});

test('docker-compose.yml: no NEXT_INTERNAL_API_URL', () => {
  const src = read('docker-compose.yml');
  assert.ok(!src.includes('NEXT_INTERNAL_API_URL'), 'Found NEXT_INTERNAL_API_URL — only valid in old Next.js rewrite model');
});

test('docker-compose.yml: uses port 5000', () => {
  const src = read('docker-compose.yml');
  assert.ok(src.includes('5000'), 'docker-compose.yml must reference port 5000');
});

test('docker-compose.yml: healthcheck points to /healthz', () => {
  const src = read('docker-compose.yml');
  assert.ok(src.includes('/healthz'), 'healthcheck must use /healthz endpoint');
});

test('docker-compose.yml: no port 4000 as primary API port', () => {
  const src = read('docker-compose.yml');
  assert.ok(!src.includes('4000:4000'), 'Found 4000:4000 — API was moved to port 5000');
});

// ---------------------------------------------------------------------------
// Dockerfile
// ---------------------------------------------------------------------------

test('Dockerfile: copies admin-ui/out to dist/public', () => {
  const src = read('Dockerfile');
  assert.ok(
    src.includes('admin-ui/out') && src.includes('dist/public'),
    'Dockerfile must copy admin-ui/out to dist/public',
  );
});

test('Dockerfile: CMD uses dist/apps/api/src/main.js', () => {
  const src = read('Dockerfile');
  assert.ok(
    src.includes('dist/apps/api/src/main.js'),
    'Dockerfile CMD must start the Fastify API at dist/apps/api/src/main.js',
  );
});

test('Dockerfile: no admin-ui/Dockerfile reference', () => {
  const src = read('Dockerfile');
  assert.ok(
    !src.includes('admin-ui/Dockerfile'),
    'Dockerfile must not reference admin-ui/Dockerfile (old standalone model)',
  );
});

// ---------------------------------------------------------------------------
// admin-ui/next.config.ts
// ---------------------------------------------------------------------------

test("admin-ui/next.config.ts: output is 'export'", () => {
  const src = read('admin-ui/next.config.ts');
  assert.ok(src.includes("output: 'export'"), "next.config.ts must set output: 'export'");
});

test("admin-ui/next.config.ts: not output 'standalone'", () => {
  const src = read('admin-ui/next.config.ts');
  assert.ok(!src.includes("output: 'standalone'"), "next.config.ts must not use output: 'standalone'");
});

test('admin-ui/next.config.ts: no rewrites()', () => {
  const src = read('admin-ui/next.config.ts');
  assert.ok(!src.includes('rewrites()') && !src.includes('async rewrites'), 'next.config.ts must not define rewrites()');
});

test("admin-ui/next.config.ts: basePath is '/admin'", () => {
  const src = read('admin-ui/next.config.ts');
  assert.ok(src.includes("basePath: '/admin'"), "next.config.ts must set basePath: '/admin'");
});

// ---------------------------------------------------------------------------
// docs/DEPLOY_VPS_DOCKER.md
// ---------------------------------------------------------------------------

test('DEPLOY_VPS_DOCKER.md: no Next standalone recommendation', () => {
  const src = read('docs/DEPLOY_VPS_DOCKER.md');
  assert.ok(
    !src.includes("output: 'standalone'") && !src.includes('output: standalone'),
    'Deploy doc must not recommend Next.js standalone output',
  );
});

test('DEPLOY_VPS_DOCKER.md: no separate admin-ui service on port 3000', () => {
  const src = read('docs/DEPLOY_VPS_DOCKER.md');
  assert.ok(
    !src.includes('port 3000') && !src.includes(':3000'),
    'Deploy doc must not recommend separate admin-ui service on port 3000',
  );
});

test('DEPLOY_VPS_DOCKER.md: describes single Fastify service on port 5000', () => {
  const src = read('docs/DEPLOY_VPS_DOCKER.md');
  assert.ok(src.includes('5000'), 'Deploy doc must document port 5000');
});

test('DEPLOY_VPS_DOCKER.md: no NEXT_INTERNAL_API_URL', () => {
  const src = read('docs/DEPLOY_VPS_DOCKER.md');
  assert.ok(
    !src.includes('NEXT_INTERNAL_API_URL'),
    'Deploy doc must not reference NEXT_INTERNAL_API_URL',
  );
});
