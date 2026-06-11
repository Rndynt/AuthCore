export interface TenantMetricsDto { userCount: number; sessionCount: number; organizationCount: number; }
export interface SystemMetricsDto { totalTenants: number; activeTenants: number; suspendedTenants: number; provisioningTenants: number; failedTenants: number; totalUsers: number; activeSessions: number; connections: unknown; }
