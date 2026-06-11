import { emitWebhookEvent } from '../../../src/utils/webhook.js';
import {
  registerWebhook,
  unregisterWebhook,
  getWebhooks,
  getWebhookStats,
} from '../../../src/utils/webhook.js';
import type { EventPublisher } from '../../core/src/ports/event-publisher';

/**
 * WebhookEventPublisher
 *
 * Implements EventPublisher by firing webhook notifications for domain events.
 */
export class WebhookEventPublisher implements EventPublisher {
  async publish(event: string, payload: unknown, tenantId?: string): Promise<void> {
    return emitWebhookEvent(event as any, payload as any, tenantId);
  }
}

export const webhookEventPublisher = new WebhookEventPublisher();

// Expose webhook registry helpers for the container / use cases
export const webhookRegistry = {
  registerWebhook,
  unregisterWebhook,
  getWebhooks,
  getWebhookStats,
};
