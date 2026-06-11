import { RealmioApiError } from '../errors';

export interface FetchTransportOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  credentials?: RequestCredentials;
  timeoutMs?: number;
  headers?: HeadersInit;
}

export class FetchTransport {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly options: FetchTransportOptions) { this.fetchImpl = options.fetch ?? fetch; }
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = this.options.timeoutMs ? new AbortController() : undefined;
    const timeout = controller ? setTimeout(() => controller.abort(), this.options.timeoutMs) : undefined;
    try {
      const res = await this.fetchImpl(new URL(path, this.options.baseUrl).toString(), {
        ...init,
        credentials: init.credentials ?? this.options.credentials,
        signal: init.signal ?? controller?.signal,
        headers: { 'Content-Type': 'application/json', ...this.options.headers, ...init.headers },
      });
      const text = await res.text();
      const body = text ? safeJson(text) : undefined;
      if (!res.ok) throw new RealmioApiError((body as any)?.message || text || `HTTP ${res.status}`, res.status, (body as any)?.error, (body as any)?.details, body ?? text);
      return body as T;
    } finally { if (timeout) clearTimeout(timeout); }
  }
}
function safeJson(text: string) { try { return JSON.parse(text); } catch { return text; } }
