export interface AuthCache { clearTenant(tenantId: string): void; clearAll(): void; getStats(): unknown; }
