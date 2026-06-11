import type { TenantRepository } from '../../ports/tenant-repository';
import type { TenantSchemaProvisioner } from '../../ports/tenant-schema-provisioner';
import type { TenantRegistry } from '../../ports/tenant-registry';
import type { AuthCache } from '../../ports/auth-cache';
import type { EventPublisher } from '../../ports/event-publisher';
import type { CreateTenantInput, Tenant } from '../../domain/tenant/tenant';
import { buildTenantSchemaName, normalizeTenantIdentifier } from '../../domain/tenant/tenant-validation';
import { TenantNotFoundError, TenantValidationError } from '../../errors/tenant-errors';

export interface TenantLifecycleDeps {
  tenantRepository: TenantRepository;
  tenantSchemaProvisioner: TenantSchemaProvisioner;
  tenantRegistry: TenantRegistry;
  authCache: AuthCache;
  eventPublisher: EventPublisher;
}

// ---------------------------------------------------------------------------
// ListTenantsUseCase
// ---------------------------------------------------------------------------

export class ListTenantsUseCase {
  constructor(private readonly deps: Pick<TenantLifecycleDeps, 'tenantRepository'>) {}

  async execute(): Promise<Tenant[]> {
    return this.deps.tenantRepository.listTenants();
  }
}

// ---------------------------------------------------------------------------
// GetTenantUseCase
// ---------------------------------------------------------------------------

export class GetTenantUseCase {
  constructor(private readonly deps: Pick<TenantLifecycleDeps, 'tenantRepository'>) {}

  async execute(tenantId: string): Promise<Tenant | null> {
    return this.deps.tenantRepository.getTenant(tenantId);
  }
}

// ---------------------------------------------------------------------------
// CreateTenantUseCase
// Orchestrates: validate → create provisioning record → provision schema →
// mark active → clear cache → register → publish event
// ---------------------------------------------------------------------------

export class CreateTenantUseCase {
  constructor(private readonly deps: TenantLifecycleDeps) {}

  async execute(input: CreateTenantInput): Promise<Tenant> {
    // 1. Validate and normalize input
    const id = normalizeTenantIdentifier(input.id, 'id');
    const slug = normalizeTenantIdentifier(input.slug, 'slug');
    const schemaName = buildTenantSchemaName(id);

    // 2. Insert tenant row in provisioning state
    const provisioningTenant = await this.deps.tenantRepository.createProvisioningTenant({
      id,
      name: input.name,
      slug,
      schemaName,
    });

    // 3. Provision the tenant schema (tables, constraints)
    await this.deps.tenantSchemaProvisioner.provisionTenantSchema(provisioningTenant);

    // 4. Mark tenant active now that the schema is ready
    const activeTenant = await this.deps.tenantRepository.markTenantActive(id);

    // 5. Clear stale auth cache entries for this tenant
    this.deps.authCache.clearTenant(activeTenant.id);

    // 6. Register in the in-memory tenant registry
    await this.deps.tenantRegistry.registerTenant(activeTenant);

    // 7. Publish domain event (fire-and-forget — do not fail the operation)
    await this.deps.eventPublisher
      .publish('tenant.created', {
        tenantId: activeTenant.id,
        name: activeTenant.name,
        slug: activeTenant.slug,
        schemaName: activeTenant.schemaName,
      })
      .catch(() => undefined);

    return activeTenant;
  }
}

// ---------------------------------------------------------------------------
// SuspendTenantUseCase / ActivateTenantUseCase / DeleteTenantUseCase
// ---------------------------------------------------------------------------

async function applyLifecycleTransition(
  deps: TenantLifecycleDeps,
  tenantId: string,
  status: 'active' | 'suspended' | 'deleted',
  event: string,
): Promise<void> {
  const tenant = await deps.tenantRepository.updateTenantStatus(tenantId, status);
  if (!tenant) {
    throw new TenantNotFoundError(tenantId);
  }
  deps.authCache.clearTenant(tenantId);
  await deps.tenantRegistry.registerTenant(tenant);
  await deps.eventPublisher
    .publish(event, { tenantId, name: tenant.name }, tenantId)
    .catch(() => undefined);
}

export class SuspendTenantUseCase {
  constructor(private readonly deps: TenantLifecycleDeps) {}

  async execute(tenantId: string): Promise<void> {
    return applyLifecycleTransition(this.deps, tenantId, 'suspended', 'tenant.suspended');
  }
}

export class ActivateTenantUseCase {
  constructor(private readonly deps: TenantLifecycleDeps) {}

  async execute(tenantId: string): Promise<void> {
    return applyLifecycleTransition(this.deps, tenantId, 'active', 'tenant.activated');
  }
}

export class DeleteTenantUseCase {
  constructor(private readonly deps: TenantLifecycleDeps) {}

  async execute(tenantId: string): Promise<void> {
    return applyLifecycleTransition(this.deps, tenantId, 'deleted', 'tenant.deleted');
  }
}
