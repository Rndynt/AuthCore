import type { TenantRepository } from '../../ports/tenant-repository';
import type { TenantRegistry } from '../../ports/tenant-registry';
import type { AuthCache } from '../../ports/auth-cache';
import type { EventPublisher } from '../../ports/event-publisher';
import type { CreateTenantInput, Tenant } from '../../domain/tenant/tenant';
import { buildTenantSchemaName, normalizeTenantIdentifier } from '../../domain/tenant/tenant-validation';
import { TenantValidationError } from '../../errors/tenant-errors';

export interface TenantLifecycleDeps {
  tenantRepository: TenantRepository;
  tenantRegistry: TenantRegistry;
  authCache: AuthCache;
  eventPublisher: EventPublisher;
}

export class ListTenantsUseCase { constructor(private deps: Pick<TenantLifecycleDeps, 'tenantRepository'>) {} execute() { return this.deps.tenantRepository.listTenants(); } }
export class GetTenantUseCase { constructor(private deps: Pick<TenantLifecycleDeps, 'tenantRepository'>) {} execute(tenantId: string) { return this.deps.tenantRepository.getTenant(tenantId); } }

export class CreateTenantUseCase {
  constructor(private deps: TenantLifecycleDeps) {}
  async execute(input: CreateTenantInput): Promise<Tenant> {
    const id = normalizeTenantIdentifier(input.id, 'id');
    const slug = normalizeTenantIdentifier(input.slug, 'slug');
    const schemaName = buildTenantSchemaName(id);
    const tenant = await this.deps.tenantRepository.createTenant({ id, name: input.name, slug, schemaName });
    this.deps.authCache.clearTenant(tenant.id);
    await this.deps.tenantRegistry.registerTenant(tenant);
    await this.deps.eventPublisher.publish('tenant.created', { tenantId: tenant.id, name: tenant.name, slug: tenant.slug, schemaName: tenant.schemaName }).catch(() => undefined);
    return tenant;
  }
}

async function updateLifecycleStatus(deps: TenantLifecycleDeps, tenantId: string, status: 'active' | 'suspended' | 'deleted', event: string): Promise<void> {
  const tenant = await deps.tenantRepository.updateTenantStatus(tenantId, status);
  if (!tenant) throw new TenantValidationError(`Tenant not found: ${tenantId}`);
  deps.authCache.clearTenant(tenantId);
  await deps.tenantRegistry.registerTenant(tenant);
  await deps.eventPublisher.publish(event, { tenantId, name: tenant.name }, tenantId).catch(() => undefined);
}

export class SuspendTenantUseCase { constructor(private deps: TenantLifecycleDeps) {} execute(tenantId: string) { return updateLifecycleStatus(this.deps, tenantId, 'suspended', 'tenant.suspended'); } }
export class ActivateTenantUseCase { constructor(private deps: TenantLifecycleDeps) {} execute(tenantId: string) { return updateLifecycleStatus(this.deps, tenantId, 'active', 'tenant.activated'); } }
export class DeleteTenantUseCase { constructor(private deps: TenantLifecycleDeps) {} execute(tenantId: string) { return updateLifecycleStatus(this.deps, tenantId, 'deleted', 'tenant.deleted'); } }
