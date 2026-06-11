/**
 * RealmioAdminClient
 *
 * Typed HTTP client for the Realmio Admin API.
 * Attach lazy resource accessors to keep imports lightweight.
 */

import { TenantsResource }         from './admin/tenants-resource';
import { SecurityResource }         from './admin/security-resource';
import { AuditResource }            from './admin/audit-resource';
import { MetricsResource }          from './admin/metrics-resource';
import { UsersResource }            from './admin/users-resource';
import { WebhooksResource }         from './admin/webhooks-resource';
import { SupportSessionsResource }  from './admin/support-sessions-resource';

export interface RealmioAdminClientOptions {
  /** Base URL of the Realmio API, e.g. https://auth.myapp.com */
  baseUrl: string;
  /** Admin session token / cookie string (passed as Cookie header) */
  sessionToken?: string;
  /** Extra headers included on every request */
  headers?: Record<string, string>;
}

export class RealmioAdminClient {
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;

  readonly tenants          = new TenantsResource(this);
  readonly security         = new SecurityResource(this);
  readonly audit            = new AuditResource(this);
  readonly metrics          = new MetricsResource(this);
  readonly users            = new UsersResource(this);
  readonly webhooks         = new WebhooksResource(this);
  readonly supportSessions  = new SupportSessionsResource(this);

  constructor(options: RealmioAdminClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...(options.sessionToken ? { Cookie: options.sessionToken } : {}),
      ...(options.headers ?? {}),
    };
  }

  // --------------------------------------------------------------------------
  // HTTP helpers (used internally by resource classes)
  // --------------------------------------------------------------------------

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
    const res = await fetch(url, {
      method,
      headers: this.defaultHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      throw new Error(`[RealmioAdminClient] ${method} ${path} → HTTP ${res.status}: ${errorText}`);
    }

    const text = await res.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }
}
