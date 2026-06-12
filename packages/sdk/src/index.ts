export { RealmioAdminClient } from './realmio-admin-client';
export type { RealmioAdminClientOptions } from './realmio-admin-client';

export { RealmioTenantAuthClient } from './realmio-tenant-auth-client';
export type { RealmioTenantAuthClientOptions } from './realmio-tenant-auth-client';

export { RealmioApiError } from './realmio-api-error';

// Admin resource types
export type { Tenant, CreateTenantInput }                          from './admin/tenants-resource';
export type { SecuritySettings, IpBlockEntry, CreateIpBlockInput } from './admin/security-resource';
export type { AuditLogEntry, AuditLogFilters, AuditListOptions }   from './admin/audit-resource';
export type { AdminUserSearchResult }                              from './admin/users-resource';
export type { Webhook, RegisterWebhookInput }                      from './admin/webhooks-resource';
export type { SupportSession }                                     from './admin/support-sessions-resource';
export type { AdminSession }                                       from './admin/admin-auth-resource';
