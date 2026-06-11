/**
 * Architecture Boundary Tests
 *
 * These tests enforce hexagonal architecture rules by statically scanning
 * source files for illegal cross-layer imports.
 *
 * Layers (inner → outer):
 *   packages/core          — domain + use cases + ports (no external deps)
 *   packages/adapters-*    — port implementations (may import core + src/)
 *   packages/http          — HTTP handlers (may import core)
 *   packages/server-*      — server factories (may import packages/*)
 *   apps/api/src           — composition root (may import packages/*)
 *   netlify/functions      — entry points (may import apps/api + packages/server-netlify)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!statSync(dir, { throwIfNoEntry: false })) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectTsFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.ts')) results.push(fullPath);
  }
  return results;
}

function importsOf(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const re = /(?:import|from|require)\s*\(?['"]([^'"]+)['"]\)?/g;
  const imports: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) imports.push(m[1]);
  return imports;
}

function relPath(p: string) { return relative(ROOT, p); }

// ---------------------------------------------------------------------------
// Rule 1: packages/core must NOT import from src/ or packages/adapters-*
// ---------------------------------------------------------------------------

describe('packages/core — no src/ or adapter imports', () => {
  const coreFiles = collectTsFiles(join(ROOT, 'packages/core/src'));

  for (const file of coreFiles) {
    it(`${relPath(file)} should not import src/ or packages/adapters-*`, () => {
      const violations = importsOf(file).filter(
        imp => imp.includes('../../src/') || imp.includes('../../../src/') ||
               imp.includes('packages/adapters-'),
      );
      expect(violations).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Rule 2: packages/http must NOT import from src/ or packages/adapters-*
// ---------------------------------------------------------------------------

describe('packages/http — no src/ or adapter imports', () => {
  const httpFiles = collectTsFiles(join(ROOT, 'packages/http/src'));

  for (const file of httpFiles) {
    it(`${relPath(file)} should not import src/ or packages/adapters-*`, () => {
      const violations = importsOf(file).filter(
        imp => imp.includes('../../src/') || imp.includes('../../../src/') ||
               imp.includes('/src/admin/') || imp.includes('/src/application/') ||
               imp.includes('/src/multi-tenant/') ||
               imp.includes('packages/adapters-'),
      );
      expect(violations).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Rule 3: netlify/functions must NOT import directly from src/
//         They must go through packages/server-netlify or apps/api
// ---------------------------------------------------------------------------

describe('netlify/functions — no direct src/ imports', () => {
  const fnFiles = collectTsFiles(join(ROOT, 'netlify/functions'));

  for (const file of fnFiles) {
    it(`${relPath(file)} should not directly import src/ application modules`, () => {
      const violations = importsOf(file).filter(
        imp =>
          (imp.includes('/src/admin/') ||
           imp.includes('/src/application/') ||
           imp.includes('/src/multi-tenant/') ||
           imp.includes('/src/utils/webhook') ||
           (imp.startsWith('../../src/') && !imp.includes('/env'))) &&
          !imp.includes('apps/api') &&
          !imp.includes('server-netlify'),
      );
      expect(violations).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Rule 4: packages/server-fastify must NOT import from src/ application logic
//         (it may import AppContainer type from apps/api/src/container)
// ---------------------------------------------------------------------------

describe('packages/server-fastify — no src/ business-logic imports', () => {
  const fastifyFiles = collectTsFiles(join(ROOT, 'packages/server-fastify/src'));

  const ALLOWED_SRC_PATTERN = /apps\/api\/src\/container/;
  const BANNED_PATTERNS = [
    /\/src\/admin\//,
    /\/src\/application\//,
    /\/src\/multi-tenant\//,
    /\/src\/server/,
  ];

  for (const file of fastifyFiles) {
    it(`${relPath(file)} should not import src/ business logic`, () => {
      const violations = importsOf(file).filter(
        imp =>
          BANNED_PATTERNS.some(p => p.test(imp)) &&
          !ALLOWED_SRC_PATTERN.test(imp),
      );
      expect(violations).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Rule 5: apps/api/src/container.ts must only wire adapters through ports
//         (no direct imports of domain objects from src/)
// ---------------------------------------------------------------------------

describe('apps/api/src/container.ts — composition root uses packages layer', () => {
  const containerPath = join(ROOT, 'apps/api/src/container.ts');

  it('should not import src/ domain/application modules (only adapters/utils)', () => {
    const violations = importsOf(containerPath).filter(
      imp =>
        (imp.includes('/src/admin/admin-api') ||
         imp.includes('/src/application/tenant-service') ||
         imp.includes('/src/multi-tenant/auth-factory') ||
         imp.includes('/src/multi-tenant/connection-manager')),
    );
    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 6: packages/core use cases must use only their deps interface
//         (no hard class instantiation from adapters inside use cases)
// ---------------------------------------------------------------------------

describe('packages/core use cases — no adapter class imports', () => {
  const useCaseDirs = [
    'packages/core/src/application/tenant',
    'packages/core/src/application/security',
    'packages/core/src/application/audit',
    'packages/core/src/application/metrics',
    'packages/core/src/application/support-session',
    'packages/core/src/application/webhook',
  ];

  for (const dir of useCaseDirs) {
    const files = collectTsFiles(join(ROOT, dir));
    for (const file of files) {
      it(`${relPath(file)} must not import adapter classes`, () => {
        const violations = importsOf(file).filter(
          imp =>
            imp.includes('adapters-postgres') ||
            imp.includes('adapters-better-auth') ||
            imp.includes('adapters-runtime') ||
            imp.includes('/src/multi-tenant/') ||
            imp.includes('/src/application/'),
        );
        expect(violations).toEqual([]);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Rule 7: packages/sdk must NOT import from packages/adapters-* or src/
// ---------------------------------------------------------------------------

describe('packages/sdk — no adapter or src/ imports', () => {
  const sdkFiles = collectTsFiles(join(ROOT, 'packages/sdk/src'));

  for (const file of sdkFiles) {
    it(`${relPath(file)} should not import adapters or src/`, () => {
      const violations = importsOf(file).filter(
        imp =>
          imp.includes('packages/adapters-') ||
          imp.includes('/src/admin/') ||
          imp.includes('/src/multi-tenant/') ||
          imp.includes('/src/application/'),
      );
      expect(violations).toEqual([]);
    });
  }
});
