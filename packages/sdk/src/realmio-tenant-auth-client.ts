import { RealmioApiError } from './realmio-api-error';

export interface RealmioTenantAuthClientOptions {
  baseUrl: string;
  tenantId: string;
  credentials?: RequestCredentials;
  fetch?: typeof globalThis.fetch;
}

class SessionResource {
  constructor(private readonly client: RealmioTenantAuthClient) {}
  async get(): Promise<unknown> { return this.client.request('GET', '/get-session'); }
}

class UserResource {
  constructor(private readonly client: RealmioTenantAuthClient) {}
  async signUp(input: { email: string; password: string; name?: string }): Promise<unknown> {
    return this.client.request('POST', '/sign-up/email', input);
  }
  async signIn(input: { email: string; password: string }): Promise<unknown> {
    return this.client.request('POST', '/sign-in/email', input);
  }
  async signOut(): Promise<void> { await this.client.request('POST', '/sign-out', {}); }
}

export class RealmioTenantAuthClient {
  private readonly baseUrl: string;
  private readonly tenantId: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly credentials: RequestCredentials;

  readonly session = new SessionResource(this);
  readonly user    = new UserResource(this);

  constructor(options: RealmioTenantAuthClientOptions) {
    this.baseUrl     = options.baseUrl.replace(/\/$/, '');
    this.tenantId    = options.tenantId;
    this.credentials = options.credentials ?? 'include';
    this.fetchImpl   = options.fetch ?? globalThis.fetch;
  }

  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/auth${path.startsWith('/') ? path : '/' + path}`;
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': this.tenantId,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: this.credentials,
    });
    const text = await res.text();
    let parsed: unknown;
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = {}; }
    if (!res.ok) {
      const p = parsed as Record<string, unknown>;
      throw new RealmioApiError(res.status, String(p?.error ?? 'UNKNOWN'), String(p?.message ?? res.statusText), p?.details, text);
    }
    return parsed as T;
  }
}
