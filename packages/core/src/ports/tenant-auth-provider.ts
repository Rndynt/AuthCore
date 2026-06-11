export interface TenantAuthProvider { getTenantAuth(tenantId: string): Promise<{ handler(request: Request): Promise<Response>; api?: unknown }>; }
