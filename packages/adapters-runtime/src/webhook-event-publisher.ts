import {
  emitWebhookEvent,
  registerWebhook,
  unregisterWebhook,
  getWebhooks,
  getWebhookStats,
} from './webhook.js';
import type { EventPublisher } from '../../core/src/ports/event-publisher';

export class WebhookEventPublisher implements EventPublisher {
  async publish(event: string, payload: unknown, tenantId?: string): Promise<void> {
    return emitWebhookEvent(event as any, payload as any, tenantId);
  }
}

export const webhookEventPublisher = new WebhookEventPublisher();

export const webhookRegistry = {
  registerWebhook,
  unregisterWebhook,
  getWebhooks,
  getWebhookStats,
};
