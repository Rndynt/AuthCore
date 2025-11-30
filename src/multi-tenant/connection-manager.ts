/**
 * Tenant Connection Manager
 * Manages Prisma client connections per tenant schema
 */

import Prisma from '@prisma/client';
import pkg from 'pg';
import type { Pool as PoolType } from 'pg';
const { Pool } = pkg;
const PrismaClient =
  Prisma.PrismaClient ??
  // Some environments expose the client on the default export
  (Prisma as { default?: { PrismaClient?: typeof Prisma.PrismaClient } }).default?.PrismaClient ??
  // Fall back to the default itself (CommonJS interop)
  (Prisma as unknown as typeof Prisma.PrismaClient);
import { env } from '../env.js';
import { Tenant, TenantRegistry, TenantNotFoundError, TenantSuspendedError } from './types';

interface ConnectionMetadata {
  createdAt: Date;
  lastUsedAt: Date;
  totalRequests: number;
}

export class TenantConnectionManager {
  private connections = new Map<string, PrismaClient>();
  private connectionMetadata = new Map<string, ConnectionMetadata>();
  private registry: TenantRegistry = {
    tenants: new Map(),
    slugToTenantId: new Map(),
    schemaToTenantId: new Map(),
    idLookup: new Map()
  };
  private initialized = false;
  private pool: PoolType;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly idleTtlMs = env.TENANT_CLIENT_IDLE_TTL_MS;

  constructor() {
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.startCleanupScheduler();
  }

  /**
   * Initialize tenant registry from database
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('⚠️ Tenant manager already initialized');
      return;
    }

    try {
      console.log('🔄 Loading tenant registry...');
      
      const result = await this.pool.query<Tenant>(`
        SELECT id, name, slug, schema_name, status, metadata, created_at, updated_at
        FROM public.tenants
        ORDER BY created_at ASC
      `);

      for (const row of result.rows) {
        const tenant: Tenant = {
          ...row,
          metadata: row.metadata || {}
        };

        this.upsertTenantInRegistry(tenant);
      }

      this.initialized = true;
      console.log(`✅ Loaded ${this.registry.tenants.size} tenants into registry`);

      // Log loaded tenants
      for (const [id, tenant] of this.registry.tenants) {
        console.log(`  📁 ${id}: ${tenant.name} (${tenant.schema_name}) [${tenant.status}]`);
      }
    } catch (error) {
      console.error('❌ Failed to initialize tenant registry:', error);
      throw error;
    }
  }

  /**
   * Get Prisma client for specific tenant
   */
  getClient(tenantId: string): PrismaClient {
    if (!this.initialized) {
      throw new Error('Tenant manager not initialized. Call initialize() first.');
    }

    // Check if tenant exists
    const tenant = this.resolveTenant(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError(tenantId);
    }

    // Check if tenant is active
    if (tenant.status !== 'active') {
      throw new TenantSuspendedError(tenantId);
    }

    // Return cached connection if exists
    const canonicalId = tenant.id;

    let client = this.connections.get(canonicalId);
    if (!client) {
      // Create new connection with tenant-specific schema
      const schemaUrl = this.buildSchemaUrl(tenant.schema_name);

      client = new PrismaClient({
        datasources: {
          db: {
            url: schemaUrl
          }
        },
        log: process.env.NODE_ENV === 'development'
          ? ['error', 'warn']
          : ['error']
      });

      this.connections.set(canonicalId, client);
      this.connectionMetadata.set(canonicalId, {
        createdAt: new Date(),
        lastUsedAt: new Date(),
        totalRequests: 0
      });

      console.log(`✅ Created Prisma client for tenant: ${canonicalId} (${tenant.schema_name})`);
    }

    this.touchConnectionMetadata(canonicalId);

    return client;
  }

  /**
   * Get tenant by ID
   */
  getTenant(tenantId: string): Tenant | undefined {
    return this.resolveTenant(tenantId);
  }

  /**
   * Get tenant by slug
   */
  getTenantBySlug(slug: string): Tenant | undefined {
    const tenantId = this.registry.slugToTenantId.get(slug.toLowerCase());
    return tenantId ? this.registry.tenants.get(tenantId) : undefined;
  }

  /**
   * Get tenant by schema name
   */
  getTenantBySchema(schemaName: string): Tenant | undefined {
    const tenantId = this.registry.schemaToTenantId.get(schemaName.toLowerCase());
    return tenantId ? this.registry.tenants.get(tenantId) : undefined;
  }

  /**
   * Check if tenant exists
   */
  hasTenant(tenantId: string): boolean {
    const normalizedId = tenantId.toLowerCase();
    return this.registry.idLookup.has(normalizedId);
  }

  /**
   * Get all active tenants
   */
  getAllTenants(): Tenant[] {
    return Array.from(this.registry.tenants.values());
  }

  /**
   * Resolve tenant by ID or slug (case-insensitive)
   */
  resolveTenant(identifier: string): Tenant | undefined {
    const normalized = identifier.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    const idMatch = this.registry.idLookup.get(normalized);
    if (idMatch) {
      return this.registry.tenants.get(idMatch);
    }

    const slugMatch = this.registry.slugToTenantId.get(normalized);
    if (slugMatch) {
      return this.registry.tenants.get(slugMatch);
    }

    return undefined;
  }

  /**
   * Disconnect specific tenant connection
   */
  async disconnect(tenantId?: string): Promise<void> {
    if (tenantId) {
      const tenant = this.resolveTenant(tenantId);
      const key = tenant ? tenant.id : tenantId;
      const client = this.connections.get(key);
      if (client) {
        try {
          await client.$disconnect();
        } catch (error) {
          console.error(`⚠️  Error disconnecting tenant client ${key}:`, error);
        }
        this.connections.delete(key);
        this.connectionMetadata.delete(key);
        console.log(`🔌 Disconnected tenant: ${key}`);
      }
    } else {
      // Disconnect all
      console.log('🔌 Disconnecting all tenant connections...');
      await this.pruneIdleConnections(true);
      console.log('✅ All tenant connections disconnected');
    }
  }

  /**
   * Reload tenant registry from database
   */
  async reload(): Promise<void> {
    console.log('🔄 Reloading tenant registry...');

    // Clear existing registry
    this.registry.tenants.clear();
    this.registry.slugToTenantId.clear();
    this.registry.schemaToTenantId.clear();
    this.registry.idLookup.clear();
    this.connectionMetadata.clear();

    // Disconnect all existing connections
    await this.disconnect();

    // Reinitialize
    this.initialized = false;
    await this.initialize();

    console.log('✅ Tenant registry reloaded');
  }

  private startCleanupScheduler() {
    if (this.cleanupInterval) {
      this.cleanupInterval.unref?.();
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.pruneIdleConnections().catch(error => {
        console.error('⚠️  Failed to prune idle tenant connections:', error);
      });
    }, this.idleTtlMs);

    this.cleanupInterval.unref?.();
  }

  async pruneIdleConnectionsNow(options: { force?: boolean } = {}): Promise<number> {
    return this.pruneIdleConnections(Boolean(options.force));
  }

  async forcePruneAllConnections(): Promise<number> {
    return this.pruneIdleConnections(true);
  }

  private async pruneIdleConnections(force = false): Promise<number> {
    const now = Date.now();
    let pruned = 0;
    for (const [tenantId, meta] of this.connectionMetadata.entries()) {
      if (!force && now - meta.lastUsedAt.getTime() < this.idleTtlMs) {
        continue;
      }

      const client = this.connections.get(tenantId);
      if (!client) {
        this.connectionMetadata.delete(tenantId);
        continue;
      }

      try {
        await client.$disconnect();
        console.log(`🧹 Closed idle Prisma client for tenant: ${tenantId}`);
        pruned += 1;
      } catch (error) {
        console.error(`⚠️  Failed to close Prisma client for tenant ${tenantId}:`, error);
      }

      this.connections.delete(tenantId);
      this.connectionMetadata.delete(tenantId);
    }
    return pruned;
  }

  /**
   * Build schema-specific database URL
   */
  private buildSchemaUrl(schemaName: string): string {
    const baseUrl = env.DATABASE_URL;

    // Parse URL and add schema parameter
    const url = new URL(baseUrl);
    url.searchParams.set('schema', schemaName);

    return url.toString();
  }

  /**
   * Get connection pool stats
   */
  getStats() {
    const tenants = Array.from(this.registry.tenants.values());
    const activeTenants = tenants.filter(t => t.status === 'active');
    const now = Date.now();

    return {
      totalTenants: tenants.length,
      activeTenants: activeTenants.length,
      activeConnections: this.connections.size,
      tenants: tenants.map(t => ({
        id: t.id,
        name: t.name,
        schema: t.schema_name,
        status: t.status,
        hasConnection: this.connections.has(t.id)
      })),
      connectionDetails: Array.from(this.connectionMetadata.entries()).map(([tenantId, meta]) => ({
        tenantId,
        createdAt: meta.createdAt.toISOString(),
        lastUsedAt: meta.lastUsedAt.toISOString(),
        totalRequests: meta.totalRequests,
        idleMilliseconds: now - meta.lastUsedAt.getTime()
      })),
      poolStats: {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      },
      idleConnectionTtlMs: this.idleTtlMs
    };
  }

  /**
   * Register or update a tenant in the in-memory registry without reloading everything
   */
  async registerTenant(tenant: Tenant): Promise<void> {
    if (!this.initialized) {
      throw new Error('Tenant manager not initialized. Call initialize() first.');
    }

    this.upsertTenantInRegistry(tenant);

    if (tenant.status !== 'active') {
      await this.disconnect(tenant.id);
    }
  }

  /**
   * Remove tenant from registry (used when tenant deleted)
   */
  async removeTenant(tenantId: string): Promise<void> {
    const tenant = this.registry.tenants.get(tenantId);
    if (!tenant) {
      return;
    }

    this.registry.tenants.delete(tenantId);
    this.registry.idLookup.delete(tenant.id.toLowerCase());
    this.registry.slugToTenantId.delete(tenant.slug.toLowerCase());
    this.registry.schemaToTenantId.delete(tenant.schema_name.toLowerCase());
    await this.disconnect(tenantId);
  }

  private touchConnectionMetadata(tenantId: string): void {
    const meta = this.connectionMetadata.get(tenantId);
    if (!meta) {
      this.connectionMetadata.set(tenantId, {
        createdAt: new Date(),
        lastUsedAt: new Date(),
        totalRequests: 1
      });
      return;
    }

    meta.lastUsedAt = new Date();
    meta.totalRequests += 1;
  }

  private upsertTenantInRegistry(tenant: Tenant): void {
    const existing = this.registry.tenants.get(tenant.id);
    if (existing) {
      this.registry.slugToTenantId.delete(existing.slug.toLowerCase());
      this.registry.schemaToTenantId.delete(existing.schema_name.toLowerCase());
      this.registry.idLookup.delete(existing.id.toLowerCase());
    }

    const normalizedId = tenant.id.toLowerCase();
    const normalizedSlug = tenant.slug.toLowerCase();
    const normalizedSchema = tenant.schema_name.toLowerCase();

    this.registry.tenants.set(tenant.id, tenant);
    this.registry.idLookup.set(normalizedId, tenant.id);
    this.registry.slugToTenantId.set(normalizedSlug, tenant.id);
    this.registry.schemaToTenantId.set(normalizedSchema, tenant.id);
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down tenant connection manager...');
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    await this.disconnect();
    await this.pool.end();
    this.initialized = false;
    console.log('✅ Tenant connection manager shut down');
  }
}

// Singleton instance
export const tenantManager = new TenantConnectionManager();

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  await tenantManager.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await tenantManager.shutdown();
  process.exit(0);
});
