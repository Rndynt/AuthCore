const isBrowser = typeof window !== 'undefined';

// Untuk production di Zo Computer, gunakan origin saat ini
// Untuk development, gunakan localhost
const resolveApiBase = (): string => {
  if (isBrowser) {
    // Selalu gunakan origin saat ini (bekerja di Zo Computer dan localhost)
    return window.location.origin;
  }
  // SSR: gunakan env atau default
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
};

export const apiBaseUrl = resolveApiBase();

export const apiClient = {
  async request(endpoint: string, options?: RequestInit) {
    const base = resolveApiBase();
    const res = await fetch(`${base}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
  },
  
  async login(email: string, password: string) {
    return this.request('/admin/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  
  async logout() {
    return this.request('/admin/auth/sign-out', { method: 'POST' });
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
    return this.request(`/admin/api/tenants/${id}/suspend`, { method: 'POST' });
  },
  
  async activateTenant(id: string) {
    return this.request(`/admin/api/tenants/${id}/activate`, { method: 'POST' });
  },
  
  async deleteTenant(id: string) {
    return this.request(`/admin/api/tenants/${id}`, { method: 'DELETE' });
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
    return this.request(`/admin/api/tenants/${tenantId}/users/${userId}/revoke-sessions`, { method: 'POST' });
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
    return this.request(`/admin/api/support-sessions/${tenantId}/${sessionId}`, { method: 'DELETE' });
  },

  async getSecuritySettings() {
    return this.request('/admin/api/security/settings');
  },

  async updateSecuritySettings(payload: Record<string, any>) {
    return this.request('/admin/api/security/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  // IP Blocking
  async getIpBlocklist() {
    return this.request('/admin/api/security/ip-blocklist');
  },

  async blockIp(ip: string, reason: string, expiresInMs?: number) {
    return this.request('/admin/api/security/ip-blocklist', {
      method: 'POST',
      body: JSON.stringify({ ip, reason, expiresInMs }),
    });
  },

  async unblockIp(ip: string) {
    return this.request(`/admin/api/security/ip-blocklist/${encodeURIComponent(ip)}`, {
      method: 'DELETE',
    });
  },

  async checkIpBlocked(ip: string) {
    return this.request(`/admin/api/security/ip-check/${encodeURIComponent(ip)}`);
  },

  async pruneConnections(force?: boolean) {
    return this.request('/admin/api/connections/prune', {
      method: 'POST',
      body: JSON.stringify({ force }),
    });
  },

  async getAuditLogs(params: Record<string, any> = {}) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) searchParams.set(k, String(v)); });
    const query = searchParams.toString();
    return this.request(`/admin/api/audit-logs${query ? `?${query}` : ''}`);
  },

  async getOrganizations() {
    return this.request('/admin/api/organizations');
  },

  async createOrganization(data: { name: string; slug: string; description?: string }) {
    return this.request('/admin/api/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getOrganization(id: string) {
    return this.request(`/admin/api/organizations/${id}`);
  },

  async updateOrganization(id: string, data: Record<string, any>) {
    return this.request(`/admin/api/organizations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteOrganization(id: string) {
    return this.request(`/admin/api/organizations/${id}`, { method: 'DELETE' });
  },

  async addOrganizationMember(orgId: string, userId: string, role: string = 'member') {
    return this.request(`/admin/api/organizations/${orgId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    });
  },

  async updateOrganizationMember(orgId: string, memberId: string, role: string) {
    return this.request(`/admin/api/organizations/${orgId}/members/${memberId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  },

  async removeOrganizationMember(orgId: string, memberId: string) {
    return this.request(`/admin/api/organizations/${orgId}/members/${memberId}`, { method: 'DELETE' });
  },

  async sendOrganizationInvitation(orgId: string, email: string, role: string = 'member') {
    return this.request(`/admin/api/organizations/${orgId}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  },

  async getOrganizationInvitations(orgId: string) {
    return this.request(`/admin/api/organizations/${orgId}/invitations`);
  },

  async revokeOrganizationInvitation(orgId: string, invitationId: string) {
    return this.request(`/admin/api/organizations/${orgId}/invitations/${invitationId}`, { method: 'DELETE' });
  },
};
