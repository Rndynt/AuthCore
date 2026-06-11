import { emitWebhookEvent } from '../../../src/utils/webhook.js';
export class WebhookEventPublisher { publish(event: string, payload: unknown, tenantId?: string) { return emitWebhookEvent(event as any, payload as any, tenantId); } }
