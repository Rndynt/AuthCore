import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createAdminApiHandlers,
  type AdminApiTenantService,
  type AdminApiDependencies
} from "../src/admin/admin-api.js";

const snapshotPath = new URL("./__snapshots__/admin-api.snapshot.json", import.meta.url);
const snapshots = JSON.parse(readFileSync(snapshotPath, "utf8")) as Record<string, unknown>;

function expectSnapshot(key: string, value: unknown) {
  assert.deepStrictEqual(value, snapshots[key]);
}

const baseTenant = {
  id: "tenant-1",
  name: "Acme Corp",
  slug: "acme",
  status: "active",
  schema_name: "tenant_acme",
  metadata: {},
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-02T00:00:00.000Z"
};

const stubTenantService = {
  listTenants: async () => [baseTenant],
  createTenant: async () => baseTenant,
  getTenant: async () => baseTenant,
  deleteTenant: async () => undefined,
  getTenantMetrics: async () => ({ ok: true }),
  suspendTenant: async () => undefined,
  activateTenant: async () => undefined,
  revokeUserSessions: async () => undefined,
  createSupportSession: async () => "support-session-token",
  searchUsersAcrossTenants: async () => [],
  getSecuritySettings: async () => ({ adminIpAllowlist: [] }),
  updateSecuritySettings: async () => ({ adminIpAllowlist: [] }),
  listActiveSupportSessions: async () => [],
  revokeSupportSession: async () => true,
  pruneIdleConnections: async () => ({ pruned: 0 }),
  getAuditLogs: async () => ({ items: [], total: 0 }),
  getSystemMetrics: async () => ({ ok: true }),
  getAdminOverview: async () => ({ tenants: 0 }),
  logAuditAction: async () => undefined
} satisfies AdminApiTenantService;

function buildDeps(overrides: Partial<AdminApiDependencies> = {}): AdminApiDependencies {
  return {
    adminAuth: {
      api: {
        getSession: async () => ({
          user: {
            id: "admin-1",
            email: "admin@example.com",
            name: "Admin",
            role: "admin"
          },
          session: {
            id: "session-1"
          }
        })
      }
    },
    tenantService: stubTenantService,
    tenantManager: {
      initialize: async () => undefined
    },
    addLogListener: () => undefined,
    removeLogListener: () => undefined,
    ...overrides
  };
}

test("admin api response snapshot for /admin/api/me", async () => {
  const { handleAdminApiRequest } = createAdminApiHandlers(buildDeps());
  const response = await handleAdminApiRequest(
    new Request("https://example.com/admin/api/me", { method: "GET" })
  );

  assert.ok(response);
  const payload = await response.json();

  expectSnapshot("admin-api-me", {
    status: response.status,
    body: payload
  });
});

test("admin api response snapshot for unauthorized request", async () => {
  const { handleAdminApiRequest } = createAdminApiHandlers(buildDeps({
    adminAuth: {
      api: {
        getSession: async () => null
      }
    }
  }));

  let response: Response | null = null;
  try {
    response = await handleAdminApiRequest(
      new Request("https://example.com/admin/api/me", { method: "GET" })
    );
  } catch (error) {
    if (error instanceof Response) {
      response = error;
    } else {
      throw error;
    }
  }

  assert.ok(response);
  const payload = await response.json();

  expectSnapshot("admin-api-unauthorized", {
    status: response.status,
    body: payload
  });
});

test("admin log stream response snapshot", async () => {
  const { handleAdminLogStream } = createAdminApiHandlers(buildDeps());
  const response = await handleAdminLogStream(
    new Request("https://example.com/admin/log-stream", { method: "GET" })
  );

  assert.ok(response);

  expectSnapshot("admin-log-stream", {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    hasBody: Boolean(response.body)
  });

  await response.body?.cancel();
});
