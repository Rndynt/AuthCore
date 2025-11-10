const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')
  : '';

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
};
