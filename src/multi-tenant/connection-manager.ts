/**
 * Tenant Connection Manager
 * Manages Prisma client connections per tenant schema
 */

import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { Tenant, TenantRegistry, TenantNotFoundError, TenantSuspendedError } from './types';

export class TenantConnectionManager {
  private connections = new Map<string, PrismaClient>();
  private registry: TenantRegistry = {
    tenants: new Map(),
    slugToTenantId: new Map(),
    schemaToTenantId: new Map()
  };
  private initialized = false;
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
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
        WHERE status = 'active'
        ORDER BY created_at ASC
      `);

      for (const row of result.rows) {
        const tenant: Tenant = {
          ...row,
          metadata: row.metadata || {}
        };
        
        this.registry.tenants.set(tenant.id, tenant);
        this.registry.slugToTenantId.set(tenant.slug, tenant.id);
        this.registry.schemaToTenantId.set(tenant.schema_name, tenant.id);
      }

      this.initialized = true;
      console.log(`✅ Loaded ${this.registry.tenants.size} active tenants`);
      
      // Log loaded tenants
      for (const [id, tenant] of this.registry.tenants) {
        console.log(`  📁 ${id}: ${tenant.name} (${tenant.schema_name})`);
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
    const tenant = this.registry.tenants.get(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError(tenantId);
    }

    // Check if tenant is active
    if (tenant.status !== 'active') {
      throw new TenantSuspendedError(tenantId);
    }

    // Return cached connection if exists
    if (this.connections.has(tenantId)) {
      return this.connections.get(tenantId)!;
    }

    // Create new connection with tenant-specific schema
    const schemaUrl = this.buildSchemaUrl(tenant.schema_name);
    
    const client = new PrismaClient({
      datasources: {
        db: {
          url: schemaUrl
        }
      },
      log: process.env.NODE_ENV === 'development' 
        ? ['error', 'warn'] 
        : ['error']
    });

    this.connections.set(tenantId, client);
    console.log(`✅ Created Prisma client for tenant: ${tenantId} (${tenant.schema_name})`);

    return client;
  }

  /**
   * Get tenant by ID
   */
  getTenant(tenantId: string): Tenant | undefined {
    return this.registry.tenants.get(tenantId);
  }

  /**
   * Get tenant by slug
   */
  getTenantBySlug(slug: string): Tenant | undefined {
    const tenantId = this.registry.slugToTenantId.get(slug);
    return tenantId ? this.registry.tenants.get(tenantId) : undefined;
  }

  /**
   * Get tenant by schema name
   */
  getTenantBySchema(schemaName: string): Tenant | undefined {
    const tenantId = this.registry.schemaToTenantId.get(schemaName);
    return tenantId ? this.registry.tenants.get(tenantId) : undefined;
  }

  /**
   * Check if tenant exists
   */
  hasTenant(tenantId: string): boolean {
    return this.registry.tenants.has(tenantId);
  }

  /**
   * Get all active tenants
   */
  getAllTenants(): Tenant[] {
    return Array.from(this.registry.tenants.values());
  }

  /**
   * Disconnect specific tenant connection
   */
  async disconnect(tenantId?: string): Promise<void> {
    if (tenantId) {
      const client = this.connections.get(tenantId);
      if (client) {
        await client.$disconnect();
        this.connections.delete(tenantId);
        console.log(`🔌 Disconnected tenant: ${tenantId}`);
      }
    } else {
      // Disconnect all
      console.log('🔌 Disconnecting all tenant connections...');
      await Promise.all(
        Array.from(this.connections.values()).map(client => 
          client.$disconnect().catch(err => 
            console.error('Error disconnecting client:', err)
          )
        )
      );
      this.connections.clear();
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
    
    // Disconnect all existing connections
    await this.disconnect();
    
    // Reinitialize
    this.initialized = false;
    await this.initialize();
    
    console.log('✅ Tenant registry reloaded');
  }

  /**
   * Build schema-specific database URL
   */
  private buildSchemaUrl(schemaName: string): string {
    const baseUrl = process.env.DATABASE_URL;
    if (!baseUrl) {
      throw new Error('DATABASE_URL environment variable not set');
    }

    // Parse URL and add schema parameter
    const url = new URL(baseUrl);
    url.searchParams.set('schema', schemaName);
    
    return url.toString();
  }

  /**
   * Get connection pool stats
   */
  getStats() {
    return {
      totalTenants: this.registry.tenants.size,
      activeConnections: this.connections.size,
      tenants: Array.from(this.registry.tenants.values()).map(t => ({
        id: t.id,
        name: t.name,
        schema: t.schema_name,
        hasConnection: this.connections.has(t.id)
      })),
      poolStats: {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      }
    };
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down tenant connection manager...');
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
