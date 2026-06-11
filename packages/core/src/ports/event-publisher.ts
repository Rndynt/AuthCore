export interface EventPublisher { publish(event: string, payload: unknown, tenantId?: string): Promise<void>; }
