import { RealmioAdminClient } from '../../packages/sdk/src/index';

const isBrowser = typeof window !== 'undefined';

const resolveApiBase = (): string => {
  // In browser, always use the same origin (Fastify serves both UI + API)
  if (isBrowser) return window.location.origin;
  // During SSR / build-time pre-render: use env var or localhost
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';
};

export const apiBaseUrl = resolveApiBase();

const createClient = () =>
  new RealmioAdminClient({ baseUrl: resolveApiBase(), credentials: 'include' });

export const apiClient = {
  // ---- Convenience pass-through for raw requests -------------------------
  request<T = unknown>(path: string, options?: RequestInit) {
    const method = (options?.method ?? 'GET').toUpperCase();
    let body: unknown;
    if (options?.body) {
      try { body = JSON.parse(options.body as string); }
      catch { body = options.body; }
    }
    return createClient().request<T>(method, path, body);
  },

  // ---- Auth --------------------------------------------------------------
  login(email: string, password: string) {
    return createClient().auth.login(email, password);
  },
  logout() {
    return createClient().auth.logout();
  },
  getSession() {
    return createClient().auth.getSession();
  },

  // ---- Tenants -----------------------------------------------------------
  getTenants() { return createClient().tenants.list(); },
  getTenant(id: string) { return createClient().tenants.get(id); },
  getTenantMetrics(id: string) { return createClient().tenants.metrics(id); },
  createTenant(data: { id: string; name: string; slug: string }) { return createClient().tenants.create(data); },
  suspendTenant(id: string) { return createClient().tenants.suspend(id); },
  activateTenant(id: string) { return createClient().tenants.activate(id); },
  deleteTenant(id: string) { return createClient().tenants.delete(id); },

  // ---- Metrics -----------------------------------------------------------
  getMetrics() { return createClient().metrics.getSystem(); },
  getOverview() { return createClient().metrics.getOverview(); },
  getDashboardMetrics() { return createClient().metrics.getDashboard(); },

  // ---- Users / Support Sessions ------------------------------------------
  searchUsers(params: { q?: string; tenantId?: string; limit?: number }) {
    return createClient().users.search(params);
  },
  revokeUserSessions(tenantId: string, userId: string) {
    return createClient().users.revokeSessions(tenantId, userId);
  },
  createSupportSession(tenantId: string, userId: string, minutes?: number) {
    return createClient().users.createSupportSession(tenantId, userId, minutes !== undefined ? { minutes } : undefined);
  },
  getSupportSessions() { return createClient().supportSessions.list(); },
  revokeSupportSession(tenantId: string, sessionId: string) {
    return createClient().supportSessions.revoke(tenantId, sessionId);
  },

  // ---- Security ----------------------------------------------------------
  getSecuritySettings() { return createClient().security.getSettings(); },
  updateSecuritySettings(payload: Record<string, unknown>) { return createClient().security.updateSettings(payload); },
  getIpBlocklist() { return createClient().security.getIpBlocklist(); },
  blockIp(ip: string, reason: string, expiresInMs?: number) {
    return createClient().security.blockIp({ ip, reason, expiresInMs });
  },
  unblockIp(ip: string) { return createClient().security.unblockIp(ip); },
  checkIpBlocked(ip: string) { return createClient().security.checkIp(ip); },

  // ---- Connections -------------------------------------------------------
  pruneConnections(force?: boolean) { return createClient().connections.prune(force); },

  // ---- Audit Logs --------------------------------------------------------
  getAuditLogs(params: Record<string, unknown> = {}) { return createClient().audit.list(params); },

  // ---- Organizations (raw API passthrough) --------------------------------
  getOrganizations() { return createClient().request('GET', '/admin/api/organizations'); },
  createOrganization(data: { name: string; slug: string; description?: string }) {
    return createClient().request('POST', '/admin/api/organizations', data);
  },
  getOrganization(id: string) { return createClient().request('GET', `/admin/api/organizations/${id}`); },
  updateOrganization(id: string, data: Record<string, unknown>) {
    return createClient().request('PUT', `/admin/api/organizations/${id}`, data);
  },
  deleteOrganization(id: string) { return createClient().request('DELETE', `/admin/api/organizations/${id}`); },
  addOrganizationMember(orgId: string, userId: string, role = 'member') {
    return createClient().request('POST', `/admin/api/organizations/${orgId}/members`, { userId, role });
  },
  updateOrganizationMember(orgId: string, memberId: string, role: string) {
    return createClient().request('PUT', `/admin/api/organizations/${orgId}/members/${memberId}`, { role });
  },
  removeOrganizationMember(orgId: string, memberId: string) {
    return createClient().request('DELETE', `/admin/api/organizations/${orgId}/members/${memberId}`);
  },
  sendOrganizationInvitation(orgId: string, email: string, role = 'member') {
    return createClient().request('POST', `/admin/api/organizations/${orgId}/invitations`, { email, role });
  },
  getOrganizationInvitations(orgId: string) {
    return createClient().request('GET', `/admin/api/organizations/${orgId}/invitations`);
  },
  revokeOrganizationInvitation(orgId: string, invitationId: string) {
    return createClient().request('DELETE', `/admin/api/organizations/${orgId}/invitations/${invitationId}`);
  },
};
