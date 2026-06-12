/**
 * Tests for shouldServeAdminUi() — the route-guard helper that controls
 * which paths Fastify serves from the Admin UI static export.
 *
 * Run: node --import tsx --test tests/static-ui-route-guard.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldServeAdminUi } from '../packages/server-fastify/src/routes/static-ui.routes.js';

// ── Paths that SHOULD serve the Admin UI ────────────────────────────────────

test('/ should serve Admin UI', () => assert.equal(shouldServeAdminUi('/'), true));
test('/admin should serve Admin UI', () => assert.equal(shouldServeAdminUi('/admin'), true));
test('/admin/ should serve Admin UI', () => assert.equal(shouldServeAdminUi('/admin/'), true));
test('/admin/settings should serve Admin UI', () => assert.equal(shouldServeAdminUi('/admin/settings'), true));
test('/admin/tenants should serve Admin UI', () => assert.equal(shouldServeAdminUi('/admin/tenants'), true));
test('/admin/users should serve Admin UI', () => assert.equal(shouldServeAdminUi('/admin/users'), true));
test('/admin/security should serve Admin UI', () => assert.equal(shouldServeAdminUi('/admin/security'), true));
test('/admin/audit should serve Admin UI', () => assert.equal(shouldServeAdminUi('/admin/audit'), true));
test('/admin/monitoring should serve Admin UI', () => assert.equal(shouldServeAdminUi('/admin/monitoring'), true));
test('/admin/support-sessions should serve Admin UI', () => assert.equal(shouldServeAdminUi('/admin/support-sessions'), true));
// Next.js _next static assets
test('/admin/_next/static/chunks/main.js should serve Admin UI', () => assert.equal(shouldServeAdminUi('/admin/_next/static/chunks/main.js'), true));

// ── Paths that MUST NOT serve the Admin UI ───────────────────────────────────

test('/api/auth/sign-in/email should NOT serve Admin UI', () =>
  assert.equal(shouldServeAdminUi('/api/auth/sign-in/email'), false));

test('/admin/api should NOT serve Admin UI', () =>
  assert.equal(shouldServeAdminUi('/admin/api'), false));

test('/admin/api/tenants should NOT serve Admin UI', () =>
  assert.equal(shouldServeAdminUi('/admin/api/tenants'), false));

test('/admin/auth/sign-in/email should NOT serve Admin UI', () =>
  assert.equal(shouldServeAdminUi('/admin/auth/sign-in/email'), false));

test('/admin/log-stream should NOT serve Admin UI', () =>
  assert.equal(shouldServeAdminUi('/admin/log-stream'), false));

test('/tenant/acme/api/auth/get-session should NOT serve Admin UI', () =>
  assert.equal(shouldServeAdminUi('/tenant/acme/api/auth/get-session'), false));

test('/legacy/auth/get-session should NOT serve Admin UI', () =>
  assert.equal(shouldServeAdminUi('/legacy/auth/get-session'), false));

test('/dev/whoami should NOT serve Admin UI', () =>
  assert.equal(shouldServeAdminUi('/dev/whoami'), false));

test('/health should NOT serve Admin UI', () =>
  assert.equal(shouldServeAdminUi('/health'), false));

test('/healthz should NOT serve Admin UI', () =>
  assert.equal(shouldServeAdminUi('/healthz'), false));

test('/ready should NOT serve Admin UI', () =>
  assert.equal(shouldServeAdminUi('/ready'), false));

test('/api/health should NOT serve Admin UI', () =>
  assert.equal(shouldServeAdminUi('/api/health'), false));
