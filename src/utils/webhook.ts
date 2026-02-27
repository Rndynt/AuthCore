/**
 * Webhook Notification System
 * 
 * Sends webhook notifications for important tenant and auth events.
 * Supports HMAC-SHA256 signature verification for security.
 * 
 * Features:
 * - Retry logic with exponential backoff
 * - HMAC-SHA256 signature for payload verification
 * - Event filtering per webhook endpoint
 * - Async delivery (non-blocking)
 */

import { createHmac, randomUUID } from 'crypto';

export type WebhookEventType =
  | 'tenant.created'
  | 'tenant.suspended'
  | 'tenant.activated'
  | 'tenant.deleted'
  | 'user.created'
  | 'user.deleted'
  | 'user.banned'
  | 'session.created'
  | 'session.revoked'
  | 'ip.blocked'
  | 'ip.unblocked'
  | 'security.settings_updated'
  | 'admin.login'
  | 'admin.logout';

export interface WebhookPayload {
  id: string;
  event: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
  tenantId?: string;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  events: WebhookEventType[] | '*';
  enabled: boolean;
  createdAt: Date;
  lastDeliveryAt?: Date;
  lastDeliveryStatus?: 'success' | 'failed';
}

export interface WebhookDeliveryResult {
  webhookId: string;
  eventId: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  attempts: number;
  deliveredAt?: Date;
}

// In-memory webhook registry (in production, persist to database)
const webhookEndpoints = new Map<string, WebhookEndpoint>();

// Delivery queue for async processing
const deliveryQueue: Array<{
  payload: WebhookPayload;
  endpoint: WebhookEndpoint;
  attempt: number;
}> = [];

let isProcessingQueue = false;

/**
 * Register a webhook endpoint
 */
export function registerWebhook(endpoint: Omit<WebhookEndpoint, 'id' | 'createdAt'>): WebhookEndpoint {
  const webhook: WebhookEndpoint = {
    ...endpoint,
    id: randomUUID(),
    createdAt: new Date(),
  };
  webhookEndpoints.set(webhook.id, webhook);
  console.log(`[Webhook] Registered endpoint: ${webhook.id} -> ${webhook.url}`);
  return webhook;
}

/**
 * Unregister a webhook endpoint
 */
export function unregisterWebhook(webhookId: string): boolean {
  const deleted = webhookEndpoints.delete(webhookId);
  if (deleted) {
    console.log(`[Webhook] Unregistered endpoint: ${webhookId}`);
  }
  return deleted;
}

/**
 * Get all registered webhooks
 */
export function getWebhooks(): WebhookEndpoint[] {
  return Array.from(webhookEndpoints.values());
}

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
export function generateWebhookSignature(payload: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = generateWebhookSignature(payload, secret);
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Emit a webhook event to all matching endpoints
 */
export async function emitWebhookEvent(
  event: WebhookEventType,
  data: Record<string, unknown>,
  tenantId?: string
): Promise<void> {
  const payload: WebhookPayload = {
    id: randomUUID(),
    event,
    timestamp: new Date().toISOString(),
    data,
    tenantId,
  };

  const matchingEndpoints = Array.from(webhookEndpoints.values()).filter(endpoint => {
    if (!endpoint.enabled) return false;
    if (endpoint.events === '*') return true;
    return endpoint.events.includes(event);
  });

  if (matchingEndpoints.length === 0) return;

  // Queue deliveries
  for (const endpoint of matchingEndpoints) {
    deliveryQueue.push({ payload, endpoint, attempt: 0 });
  }

  // Process queue asynchronously
  if (!isProcessingQueue) {
    processDeliveryQueue().catch(err => {
      console.error('[Webhook] Queue processing error:', err);
    });
  }
}

/**
 * Process the delivery queue with retry logic
 */
async function processDeliveryQueue(): Promise<void> {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    while (deliveryQueue.length > 0) {
      const item = deliveryQueue.shift();
      if (!item) break;

      const { payload, endpoint, attempt } = item;
      const maxAttempts = 3;

      try {
        const result = await deliverWebhook(payload, endpoint);
        
        // Update endpoint status
        const ep = webhookEndpoints.get(endpoint.id);
        if (ep) {
          ep.lastDeliveryAt = new Date();
          ep.lastDeliveryStatus = result.success ? 'success' : 'failed';
        }

        if (!result.success && attempt < maxAttempts - 1) {
          // Retry with exponential backoff
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          setTimeout(() => {
            deliveryQueue.push({ payload, endpoint, attempt: attempt + 1 });
            if (!isProcessingQueue) {
              processDeliveryQueue().catch(console.error);
            }
          }, delay);
        }
      } catch (error) {
        console.error(`[Webhook] Delivery error for ${endpoint.id}:`, error);
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}

/**
 * Deliver a webhook to a single endpoint
 */
async function deliverWebhook(
  payload: WebhookPayload,
  endpoint: WebhookEndpoint
): Promise<WebhookDeliveryResult> {
  const payloadStr = JSON.stringify(payload);
  const signature = generateWebhookSignature(payloadStr, endpoint.secret);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Id': payload.id,
        'X-Webhook-Event': payload.event,
        'X-Webhook-Timestamp': payload.timestamp,
        'X-Webhook-Signature': `sha256=${signature}`,
        'User-Agent': 'AuthCore-Webhook/1.0',
      },
      body: payloadStr,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const success = response.ok;
    
    if (!success) {
      console.warn(`[Webhook] Delivery failed for ${endpoint.id}: HTTP ${response.status}`);
    }

    return {
      webhookId: endpoint.id,
      eventId: payload.id,
      success,
      statusCode: response.status,
      attempts: 1,
      deliveredAt: success ? new Date() : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Webhook] Network error for ${endpoint.id}:`, errorMessage);
    
    return {
      webhookId: endpoint.id,
      eventId: payload.id,
      success: false,
      error: errorMessage,
      attempts: 1,
    };
  }
}

/**
 * Get webhook delivery statistics
 */
export function getWebhookStats() {
  const endpoints = Array.from(webhookEndpoints.values());
  return {
    totalEndpoints: endpoints.length,
    enabledEndpoints: endpoints.filter(e => e.enabled).length,
    queueSize: deliveryQueue.length,
    endpoints: endpoints.map(e => ({
      id: e.id,
      url: e.url,
      enabled: e.enabled,
      events: e.events,
      lastDeliveryAt: e.lastDeliveryAt?.toISOString(),
      lastDeliveryStatus: e.lastDeliveryStatus,
    })),
  };
}
