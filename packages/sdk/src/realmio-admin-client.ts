import { FetchTransport, type FetchTransportOptions } from './transport/fetch-transport';
import type { CreateTenantDto, TenantDto } from './dto/tenant.dto';
import type { SecuritySettingsDto } from './dto/security.dto';

export interface RealmioAdminClientOptions extends FetchTransportOptions {}

export class RealmioAdminClient {
  private transport: FetchTransport;
  constructor(options: RealmioAdminClientOptions) { this.transport = new FetchTransport(options); }
  request<T>(endpoint: string, options?: RequestInit) { return this.transport.request<T>(endpoint, options); }
  auth = {
    login: (email: string, password: string) => this.request('/admin/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => this.request('/admin/auth/sign-out', { method: 'POST' }),
    getSession: () => this.request('/admin/auth/get-session'),
  };
  tenants = {
    list: () => this.request<{ tenants: TenantDto[] }>('/admin/api/tenants'),
    get: (id: string) => this.request<{ tenant: TenantDto }>(`/admin/api/tenants/${encodeURIComponent(id)}`),
    create: (data: CreateTenantDto) => this.request<{ tenant: TenantDto }>('/admin/api/tenants', { method: 'POST', body: JSON.stringify(data) }),
    suspend: (id: string) => this.request(`/admin/api/tenants/${encodeURIComponent(id)}/suspend`, { method: 'POST' }),
    activate: (id: string) => this.request(`/admin/api/tenants/${encodeURIComponent(id)}/activate`, { method: 'POST' }),
    delete: (id: string) => this.request(`/admin/api/tenants/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    metrics: (id: string) => this.request(`/admin/api/tenants/${encodeURIComponent(id)}/metrics`),
  };
  metrics = { system: () => this.request('/admin/api/metrics'), overview: () => this.request('/admin/api/overview'), dashboard: () => this.request('/admin/api/dashboard-metrics'), timeSeries: () => this.request('/admin/api/time-series') };
  users = { search: (params: { q?: string; tenantId?: string; limit?: number } = {}) => this.request(`/admin/api/users/search${query(params)}`), revokeSessions: (tenantId: string, userId: string) => this.request(`/admin/api/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}/revoke-sessions`, { method: 'POST' }), createSupportSession: (tenantId: string, userId: string, minutes?: number) => this.request(`/admin/api/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}/support-session`, { method: 'POST', body: JSON.stringify({ minutes }) }) };
  supportSessions = { list: () => this.request('/admin/api/support-sessions'), revoke: (tenantId: string, sessionId: string) => this.request(`/admin/api/support-sessions/${encodeURIComponent(tenantId)}/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }) };
  security = { getSettings: () => this.request<{ settings: SecuritySettingsDto }>('/admin/api/security/settings'), updateSettings: (payload: SecuritySettingsDto) => this.request('/admin/api/security/settings', { method: 'PUT', body: JSON.stringify(payload) }), getIpBlocklist: () => this.request('/admin/api/security/ip-blocklist'), blockIp: (ip: string, reason: string, expiresInMs?: number) => this.request('/admin/api/security/ip-blocklist', { method: 'POST', body: JSON.stringify({ ip, reason, expiresInMs }) }), unblockIp: (ip: string) => this.request(`/admin/api/security/ip-blocklist/${encodeURIComponent(ip)}`, { method: 'DELETE' }), checkIpBlocked: (ip: string) => this.request(`/admin/api/security/ip-check/${encodeURIComponent(ip)}`) };
  audit = { list: (params: Record<string, unknown> = {}) => this.request(`/admin/api/audit-logs${query(params)}`) };
  connections = { prune: (force?: boolean) => this.request('/admin/api/connections/prune', { method: 'POST', body: JSON.stringify({ force }) }) };
  webhooks = { list: () => this.request('/admin/api/webhooks'), register: (payload: unknown) => this.request('/admin/api/webhooks', { method: 'POST', body: JSON.stringify(payload) }), unregister: (id: string) => this.request(`/admin/api/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' }) };
}
function query(params: Record<string, unknown>) { const sp = new URLSearchParams(); for (const [k,v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v)); const qs = sp.toString(); return qs ? `?${qs}` : ''; }
