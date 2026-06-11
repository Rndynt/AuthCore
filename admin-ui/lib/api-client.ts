import { RealmioAdminClient } from '../../packages/sdk/src/index';

const isBrowser = typeof window !== 'undefined';

const resolveApiBase = (): string => {
  if (isBrowser) return window.location.origin;
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
};

export const apiBaseUrl = resolveApiBase();

const createClient = () => new RealmioAdminClient({
  baseUrl: resolveApiBase(),
  credentials: 'include',
});

export const apiClient: any = {
  request<T = any>(endpoint: string, options?: RequestInit) {
    return createClient().request<T>(endpoint, options);
  },

  login(email: string, password: string) {
    return createClient().auth.login(email, password);
  },

  logout() {
    return createClient().auth.logout();
  },

  getSession(): Promise<any> {
    return createClient().auth.getSession();
  },

  getTenants() {
    return createClient().tenants.list();
  },

  getTenantMetrics(id: string) {
    return createClient().tenants.metrics(id);
  },

  createTenant(data: { id: string; name: string; slug: string }) {
    return createClient().tenants.create(data);
  },

  suspendTenant(id: string) {
    return createClient().tenants.suspend(id);
  },

  activateTenant(id: string) {
    return createClient().tenants.activate(id);
  },

  deleteTenant(id: string) {
    return createClient().tenants.delete(id);
  },

  getMetrics() {
    return createClient().metrics.system();
  },

  getOverview() {
    return createClient().metrics.overview();
  },

  searchUsers(params: { q?: string; tenantId?: string; limit?: number }) {
    return createClient().users.search(params);
  },

  revokeUserSessions(tenantId: string, userId: string) {
    return createClient().users.revokeSessions(tenantId, userId);
  },

  createSupportSession(tenantId: string, userId: string, minutes?: number) {
    return createClient().users.createSupportSession(tenantId, userId, minutes);
  },

  getSupportSessions() {
    return createClient().supportSessions.list();
  },

  revokeSupportSession(tenantId: string, sessionId: string) {
    return createClient().supportSessions.revoke(tenantId, sessionId);
  },

  getSecuritySettings() {
    return createClient().security.getSettings();
  },

  updateSecuritySettings(payload: Record<string, any>) {
    return createClient().security.updateSettings(payload);
  },

  getIpBlocklist() {
    return createClient().security.getIpBlocklist();
  },

  blockIp(ip: string, reason: string, expiresInMs?: number) {
    return createClient().security.blockIp(ip, reason, expiresInMs);
  },

  unblockIp(ip: string) {
    return createClient().security.unblockIp(ip);
  },

  checkIpBlocked(ip: string) {
    return createClient().security.checkIpBlocked(ip);
  },

  getDashboardMetrics() {
    return createClient().metrics.dashboard();
  },

  pruneConnections(force?: boolean) {
    return createClient().connections.prune(force);
  },

  getAuditLogs(params: Record<string, any> = {}) {
    return createClient().audit.list(params);
  },

  getOrganizations() {
    return createClient().request('/admin/api/organizations');
  },

  createOrganization(data: { name: string; slug: string; description?: string }) {
    return createClient().request('/admin/api/organizations', { method: 'POST', body: JSON.stringify(data) });
  },

  getOrganization(id: string) {
    return createClient().request(`/admin/api/organizations/${id}`);
  },

  updateOrganization(id: string, data: Record<string, any>) {
    return createClient().request(`/admin/api/organizations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  deleteOrganization(id: string) {
    return createClient().request(`/admin/api/organizations/${id}`, { method: 'DELETE' });
  },

  addOrganizationMember(orgId: string, userId: string, role: string = 'member') {
    return createClient().request(`/admin/api/organizations/${orgId}/members`, { method: 'POST', body: JSON.stringify({ userId, role }) });
  },

  updateOrganizationMember(orgId: string, memberId: string, role: string) {
    return createClient().request(`/admin/api/organizations/${orgId}/members/${memberId}`, { method: 'PUT', body: JSON.stringify({ role }) });
  },

  removeOrganizationMember(orgId: string, memberId: string) {
    return createClient().request(`/admin/api/organizations/${orgId}/members/${memberId}`, { method: 'DELETE' });
  },

  sendOrganizationInvitation(orgId: string, email: string, role: string = 'member') {
    return createClient().request(`/admin/api/organizations/${orgId}/invitations`, { method: 'POST', body: JSON.stringify({ email, role }) });
  },

  getOrganizationInvitations(orgId: string) {
    return createClient().request(`/admin/api/organizations/${orgId}/invitations`);
  },

  revokeOrganizationInvitation(orgId: string, invitationId: string) {
    return createClient().request(`/admin/api/organizations/${orgId}/invitations/${invitationId}`, { method: 'DELETE' });
  },
};
