import type { RealmioAdminClient } from '../realmio-admin-client';

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

export interface RegisterWebhookInput {
  url: string;
  secret: string;
  events: string[];
}

export class WebhooksResource {
  constructor(private readonly client: RealmioAdminClient) {}

  async list(): Promise<Webhook[]> {
    const data = await this.client.get<{ webhooks?: Webhook[] }>('/admin/api/webhooks');
    return (data as any).webhooks ?? (Array.isArray(data) ? data : []);
  }

  async register(input: RegisterWebhookInput): Promise<Omit<Webhook, 'secret'>> {
    const data = await this.client.post<{ webhook: Omit<Webhook, 'secret'> }>(
      '/admin/api/webhooks',
      input,
    );
    return data.webhook;
  }

  async unregister(webhookId: string): Promise<void> {
    await this.client.delete(`/admin/api/webhooks/${webhookId}`);
  }
}
