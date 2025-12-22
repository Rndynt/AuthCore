const envApiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
const envAuthService = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL?.replace(/\/$/, '');
const envAdminFunctionPath = process.env.NEXT_PUBLIC_ADMIN_FUNCTION_PATH?.replace(/\/$/, '');

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);
const withLeadingSlash = (value: string) => (value.startsWith('/') ? value : `/${value}`);
const mapNetlifyFunctionsPath = (value: string) =>
  value === '/.netlify/functions' ? '/.netlify/functions/admin-auth' : value;

const defaultFunctionPath = '/.netlify/functions/admin-auth';

const adminFunctionPath = envAdminFunctionPath
  ? isAbsoluteUrl(envAdminFunctionPath)
    ? envAdminFunctionPath
    : mapNetlifyFunctionsPath(withLeadingSlash(envAdminFunctionPath))
  : defaultFunctionPath;

const relativeApiPath = envApiUrl && !isAbsoluteUrl(envApiUrl)
  ? mapNetlifyFunctionsPath(withLeadingSlash(envApiUrl))
  : undefined;

const absoluteEnvBase = (() => {
  if (envApiUrl && isAbsoluteUrl(envApiUrl)) {
    return envApiUrl;
  }
  if (isAbsoluteUrl(adminFunctionPath)) {
    return adminFunctionPath;
  }
  if (envAuthService && isAbsoluteUrl(envAuthService)) {
    return `${envAuthService}${adminFunctionPath}`;
  }
  return undefined;
})();

let cachedBase: string | undefined = absoluteEnvBase;

const resolveApiBase = (): string => {
  if (cachedBase) return cachedBase;

  if (typeof window !== 'undefined') {
    const origin = window.location.origin.replace(/\/$/, '');
    if (isAbsoluteUrl(adminFunctionPath)) {
      cachedBase = adminFunctionPath;
      return cachedBase;
    }
    const relative = relativeApiPath ?? adminFunctionPath;
    cachedBase = `${origin}${relative}`;
    return cachedBase;
  }

  throw new Error(
    'Unable to resolve API base URL. Set NEXT_PUBLIC_API_URL, NEXT_PUBLIC_ADMIN_FUNCTION_PATH, or NEXT_PUBLIC_AUTH_SERVICE_URL to an absolute URL.'
  );
};

export const apiBaseUrl = (() => {
  try {
    return resolveApiBase();
  } catch {
    return '';
  }
})();

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

  async updateOrganization(id: string, data: { name?: string; slug?: string; description?: string; logo?: string }) {
    return this.request(`/admin/api/organizations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteOrganization(id: string) {
    return this.request(`/admin/api/organizations/${id}`, {
      method: 'DELETE',
    });
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
    return this.request(`/admin/api/organizations/${orgId}/members/${memberId}`, {
      method: 'DELETE',
    });
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
    return this.request(`/admin/api/organizations/${orgId}/invitations/${invitationId}`, {
      method: 'DELETE',
    });
  },
};
