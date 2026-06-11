import { FetchTransport, type FetchTransportOptions } from './transport/fetch-transport';
export interface RealmioTenantAuthClientOptions extends FetchTransportOptions { tenantId: string; }
export class RealmioTenantAuthClient {
  private transport: FetchTransport;
  constructor(private readonly options: RealmioTenantAuthClientOptions) { this.transport = new FetchTransport({ ...options, headers: { ...options.headers, 'X-Tenant-Id': options.tenantId } }); }
  request<T>(endpoint: string, options?: RequestInit) { return this.transport.request<T>(endpoint, options); }
  email = { signIn: (data: { email: string; password: string }) => this.request('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify(data) }), signUp: (data: { email: string; password: string; name?: string }) => this.request('/api/auth/sign-up/email', { method: 'POST', body: JSON.stringify(data) }), signOut: () => this.request('/api/auth/sign-out', { method: 'POST' }) };
  session = { get: () => this.request('/api/auth/get-session') };
}
