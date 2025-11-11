const rawBase = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')
  : '';

const API_BASE =
  rawBase && rawBase.includes('/.netlify/functions') && !rawBase.endsWith('/auth')
    ? `${rawBase}/auth`
    : rawBase;

export const apiBaseUrl = API_BASE;

export const apiClient = {
  async request(endpoint: string, options?: RequestInit) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  
  async login(email: string, password: string) {
    return this.request('/admin/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  
  async logout() {
    return this.request('/admin/auth/sign-out', {
      method: 'POST',
    });
  },
  
  async getSession() {
    return this.request('/admin/auth/get-session');
  },
  
  async getTenants() {
    return this.request('/admin/api/tenants');
  },

  async getTenantMetrics(id: string) {
    return this.request(`/admin/api/tenants/${id}/metrics`);
  },
  
  async createTenant(data: { id: string; name: string; slug: string }) {
    return this.request('/admin/api/tenants', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  async suspendTenant(id: string) {
    return this.request(`/admin/api/tenants/${id}/suspend`, {
      method: 'POST',
    });
  },
  
  async activateTenant(id: string) {
    return this.request(`/admin/api/tenants/${id}/activate`, {
      method: 'POST',
    });
  },
  
  async deleteTenant(id: string) {
    return this.request(`/admin/api/tenants/${id}`, {
      method: 'DELETE',
    });
  },
  
  async getMetrics() {
    return this.request('/admin/api/metrics');
  },

  async getOverview() {
    return this.request('/admin/api/overview');
  },

  async searchUsers(params: { q?: string; tenantId?: string; limit?: number }) {
    const searchParams = new URLSearchParams();
    if (params.q) searchParams.set('q', params.q);
    if (params.tenantId) searchParams.set('tenantId', params.tenantId);
    if (params.limit) searchParams.set('limit', String(params.limit));
    const query = searchParams.toString();
    return this.request(`/admin/api/users/search${query ? `?${query}` : ''}`);
  },

  async revokeUserSessions(tenantId: string, userId: string) {
    return this.request(`/admin/api/tenants/${tenantId}/users/${userId}/revoke-sessions`, {
      method: 'POST',
    });
  },

  async createSupportSession(tenantId: string, userId: string, minutes?: number) {
    return this.request(`/admin/api/tenants/${tenantId}/users/${userId}/support-session`, {
      method: 'POST',
      body: JSON.stringify({ minutes }),
    });
  },

  async getSupportSessions() {
    return this.request('/admin/api/support-sessions');
  },

  async revokeSupportSession(tenantId: string, sessionId: string) {
    return this.request(`/admin/api/support-sessions/${tenantId}/${sessionId}`, {
      method: 'DELETE',
    });
  },

  async getSecuritySettings() {
    return this.request('/admin/api/security/settings');
  },

  async updateSecuritySettings(
    payload: Partial<{
      trustedOrigins: string[];
      enableDevEndpoints: boolean;
      apiKeyRotationDays: number | null;
      adminIpAllowlist: string[];
      enforceAdminMfa: boolean;
      readOnlyMode: boolean;
    }>
  ) {
    return this.request('/admin/api/security/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async pruneConnections(force?: boolean) {
    return this.request('/admin/api/connections/prune', {
      method: 'POST',
      body: JSON.stringify({ force }),
    });
  },

  async getAuditLogs(params: {
    limit?: number;
    offset?: number;
    action?: string;
    targetType?: string;
    targetId?: string;
    adminUserId?: string;
    from?: string;
    to?: string;
    search?: string;
    tenantStatus?: string;
  } = {}) {
    const searchParams = new URLSearchParams();
    if (typeof params.limit === 'number') searchParams.set('limit', String(params.limit));
    if (typeof params.offset === 'number') searchParams.set('offset', String(params.offset));
    if (params.action) searchParams.set('action', params.action);
    if (params.targetType) searchParams.set('targetType', params.targetType);
    if (params.targetId) searchParams.set('targetId', params.targetId);
    if (params.adminUserId) searchParams.set('adminUserId', params.adminUserId);
    if (params.from) searchParams.set('from', params.from);
    if (params.to) searchParams.set('to', params.to);
    if (params.search) searchParams.set('search', params.search);
    if (params.tenantStatus) searchParams.set('tenantStatus', params.tenantStatus);
    const query = searchParams.toString();
    return this.request(`/admin/api/audit-logs${query ? `?${query}` : ''}`);
  },
};
