import { TenantsResource }        from './admin/tenants-resource';
import { SecurityResource }        from './admin/security-resource';
import { AuditResource }           from './admin/audit-resource';
import { MetricsResource }         from './admin/metrics-resource';
import { UsersResource }           from './admin/users-resource';
import { WebhooksResource }        from './admin/webhooks-resource';
import { SupportSessionsResource } from './admin/support-sessions-resource';
import { AdminAuthResource }       from './admin/admin-auth-resource';
import { ConnectionsResource }     from './admin/connections-resource';
import { RealmioApiError }         from './realmio-api-error';

export interface RealmioAdminClientOptions {
  baseUrl: string;
  sessionToken?: string;
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
}

export class RealmioAdminClient {
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly credentials: RequestCredentials;

  readonly auth            = new AdminAuthResource(this);
  readonly tenants         = new TenantsResource(this);
  readonly security        = new SecurityResource(this);
  readonly audit           = new AuditResource(this);
  readonly metrics         = new MetricsResource(this);
  readonly users           = new UsersResource(this);
  readonly webhooks        = new WebhooksResource(this);
  readonly supportSessions = new SupportSessionsResource(this);
  readonly connections     = new ConnectionsResource(this);

  constructor(options: RealmioAdminClientOptions) {
    this.baseUrl     = options.baseUrl.replace(/\/$/, '');
    this.credentials = options.credentials ?? 'include';
    this.fetchImpl   = options.fetch ?? globalThis.fetch;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...(options.sessionToken ? { Cookie: options.sessionToken } : {}),
      ...(options.headers ?? {}),
    };
  }

  async get<T = unknown>(path: string): Promise<T> { return this.request<T>('GET', path); }
  async post<T = unknown>(path: string, body: unknown): Promise<T> { return this.request<T>('POST', path, body); }
  async put<T = unknown>(path: string, body: unknown): Promise<T> { return this.request<T>('PUT', path, body); }
  async delete<T = unknown>(path: string): Promise<T> { return this.request<T>('DELETE', path); }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
    const res = await this.fetchImpl(url, {
      method,
      headers: this.defaultHeaders,
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
