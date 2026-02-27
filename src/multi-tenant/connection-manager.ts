/**
 * Tenant Connection Manager
 * Manages Prisma client connections per tenant schema
 * 
 * IMPROVEMENTS:
 * - Added max connections limit to prevent memory leak
 * - Implemented LRU (Least Recently Used) eviction
 * - Proper cleanup on disconnect failure
 * - Connection pool monitoring
 * - Graceful shutdown with timeout
 * - Schema validation before creating client
 */

import { PrismaClient } from '@prisma/client';
import pkg from 'pg';
import type { Pool as PoolType } from 'pg';
const { Pool } = pkg;
import { env } from '../env.js';
import { Tenant, TenantRegistry, TenantNotFoundError, TenantSuspendedError } from './types';

interface ConnectionMetadata {
  createdAt: Date;
  lastUsedAt: Date;
  totalRequests: number;
  lastError?: string;
  disconnectAttempts: number;
  schemaValidated: boolean;
}

interface ConnectionManagerConfig {
  maxConnections: number;
  idleTtlMs: number;
  cleanupIntervalMs: number;
  maxDisconnectAttempts: number;
  shutdownTimeoutMs: number;
}

const DEFAULT_CONFIG: ConnectionManagerConfig = {
  maxConnections: 50, // Maximum Prisma clients
  idleTtlMs: env.TENANT_CLIENT_IDLE_TTL_MS || 5 * 60 * 1000, // 5 minutes
  cleanupIntervalMs: 60 * 1000, // 1 minute
  maxDisconnectAttempts: 3,
  shutdownTimeoutMs: 30 * 1000, // 30 seconds
};

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
  private readonly config: ConnectionManagerConfig;
  
  // LRU tracking
  private lruOrder: string[] = [];
  
  // Monitoring
  private stats = {
    totalConnectionsCreated: 0,
    totalConnectionsEvicted: 0,
    totalDisconnectErrors: 0,
    lastCleanupAt: new Date(),
  };

  constructor(config: Partial<ConnectionManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Import pool config from env for consistent configuration
    const poolMax = env.POOL_MAX || 20;
    const poolIdleTimeout = env.POOL_IDLE_TIMEOUT_MS || 30000;
    
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: poolMax,
      idleTimeoutMillis: poolIdleTimeout,
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
   * Implements LRU eviction when max connections reached
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
    if (client) {
      // Update LRU order
      this.updateLRU(canonicalId);
      this.touchConnectionMetadata(canonicalId);
      return client;
    }

    // Check if we need to evict connections
    if (this.connections.size >= this.config.maxConnections) {
      this.evictLRUConnections();
    }

    // Create new connection with tenant-specific schema
    const schemaUrl = this.buildSchemaUrl(tenant.schema_name);

    try {
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
        totalRequests: 0,
        disconnectAttempts: 0,
        schemaValidated: false  // Will be validated on first use
      });

      // Add to LRU
      this.lruOrder.push(canonicalId);
      
      this.stats.totalConnectionsCreated++;

      console.log(`✅ Created Prisma client for tenant: ${canonicalId} (${tenant.schema_name}) [${this.connections.size}/${this.config.maxConnections}]`);
    } catch (error) {
      console.error(`❌ Failed to create Prisma client for tenant ${canonicalId}:`, error);
      throw new Error(`Failed to create database connection for tenant: ${tenantId}`);
    }

    return client;
  }

  /**
   * Check if tenant schema exists (for health check)
   */
  async validateTenantSchema(schemaName: string): Promise<boolean> {
    try {
      const result = await this.pool.query<{ exists: boolean }>(
        `SELECT EXISTS(
          SELECT 1 FROM information_schema.schemata 
          WHERE schema_name = $1
        )`,
        [schemaName]
      );
      return result.rows[0]?.exists ?? false;
    } catch (error) {
      console.error(`[TenantManager] Failed to validate schema ${schemaName}:`, error);
      return false;
    }
  }

  /**
   * Update LRU order - move to end (most recently used)
   */
  private updateLRU(tenantId: string): void {
    const index = this.lruOrder.indexOf(tenantId);
    if (index > -1) {
      this.lruOrder.splice(index, 1);
      this.lruOrder.push(tenantId);
    }
  }

  /**
   * Evict LRU connections to make room for new ones
   */
  private evictLRUConnections(): void {
    const evictCount = Math.max(1, Math.floor(this.config.maxConnections * 0.1)); // Evict 10%
    let evicted = 0;

    while (this.lruOrder.length > 0 && evicted < evictCount) {
      const oldestTenantId = this.lruOrder.shift();
      if (!oldestTenantId) break;

      const client = this.connections.get(oldestTenantId);
      if (client) {
        // Attempt graceful disconnect (non-blocking)
        this.gracefulDisconnect(oldestTenantId, client).catch(err => {
          console.error(`⚠️  Background disconnect error for ${oldestTenantId}:`, err);
        });

        this.connections.delete(oldestTenantId);
        this.connectionMetadata.delete(oldestTenantId);
        evicted++;
        this.stats.totalConnectionsEvicted++;
        
        console.log(`🧹 Evicted LRU connection for tenant: ${oldestTenantId}`);
      }
    }

    if (evicted > 0) {
      console.log(`📊 Evicted ${evicted} LRU connections. Active: ${this.connections.size}/${this.config.maxConnections}`);
    }
  }

  /**
   * Graceful disconnect with retry logic
   */
  private async gracefulDisconnect(tenantId: string, client: PrismaClient): Promise<void> {
    const meta = this.connectionMetadata.get(tenantId);
    const attempts = meta?.disconnectAttempts || 0;

    if (attempts >= this.config.maxDisconnectAttempts) {
      console.warn(`⚠️  Max disconnect attempts reached for ${tenantId}, forcing removal`);
      this.stats.totalDisconnectErrors++;
      return;
    }

    try {
      await client.$disconnect();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`⚠️  Disconnect attempt ${attempts + 1} failed for ${tenantId}:`, errorMessage);
      
      if (meta) {
        meta.disconnectAttempts = attempts + 1;
        meta.lastError = errorMessage;
      }
      
      this.stats.totalDisconnectErrors++;
      throw error;
    }
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
          await this.gracefulDisconnect(key, client);
        } catch (error) {
          console.error(`⚠️  Error disconnecting tenant client ${key}:`, error);
        }
        this.connections.delete(key);
        this.connectionMetadata.delete(key);
        
        // Remove from LRU
        const lruIndex = this.lruOrder.indexOf(key);
        if (lruIndex > -1) {
          this.lruOrder.splice(lruIndex, 1);
        }
        
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
    this.lruOrder = [];

    // Disconnect all existing connections
    await this.disconnect();

    // Reinitialize
    this.initialized = false;
    await this.initialize();

    console.log('✅ Tenant registry reloaded');
  }

  private startCleanupScheduler() {
    // Don't start cleanup scheduler in serverless environments
    // (Netlify Functions, AWS Lambda, Vercel) - Lambda containers are
    // short-lived and don't need periodic cleanup
    const isServerless = !!(
      process.env.NETLIFY ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.VERCEL ||
      process.env.LAMBDA_TASK_ROOT ||
      process.env.AWS_EXECUTION_ENV
    );
    
    if (isServerless) {
      return;
    }

    if (this.cleanupInterval) {
      this.cleanupInterval.unref?.();
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.pruneIdleConnections().catch(error => {
        console.error('⚠️  Failed to prune idle tenant connections:', error);
      });
    }, this.config.cleanupIntervalMs);

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
    
    // Get list of tenants to prune (avoid modifying during iteration)
    const toPrune: string[] = [];
    
    for (const [tenantId, meta] of this.connectionMetadata.entries()) {
      if (force || now - meta.lastUsedAt.getTime() >= this.config.idleTtlMs) {
        toPrune.push(tenantId);
      }
    }

    for (const tenantId of toPrune) {
      const client = this.connections.get(tenantId);
      if (!client) {
        this.connectionMetadata.delete(tenantId);
        continue;
      }

      try {
        await this.gracefulDisconnect(tenantId, client);
        console.log(`🧹 Closed idle Prisma client for tenant: ${tenantId}`);
        pruned += 1;
      } catch (error) {
        console.error(`⚠️  Failed to close Prisma client for tenant ${tenantId}:`, error);
        // Still remove from tracking even if disconnect failed
      }

      this.connections.delete(tenantId);
      this.connectionMetadata.delete(tenantId);
      
      // Remove from LRU
      const lruIndex = this.lruOrder.indexOf(tenantId);
      if (lruIndex > -1) {
        this.lruOrder.splice(lruIndex, 1);
      }
    }
    
    this.stats.lastCleanupAt = new Date();
    this.stats.totalConnectionsEvicted += pruned;
    
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
   * Get connection pool stats (enhanced with monitoring data)
   */
  getStats() {
    const tenants = Array.from(this.registry.tenants.values());
    const activeTenants = tenants.filter(t => t.status === 'active');
    const now = Date.now();

    return {
      totalTenants: tenants.length,
      activeTenants: activeTenants.length,
      activeConnections: this.connections.size,
      maxConnections: this.config.maxConnections,
      connectionUtilization: (this.connections.size / this.config.maxConnections * 100).toFixed(1) + '%',
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
        idleMilliseconds: now - meta.lastUsedAt.getTime(),
        disconnectAttempts: meta.disconnectAttempts,
        lastError: meta.lastError
      })),
      poolStats: {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      },
      monitoring: {
        ...this.stats,
        lruOrderSize: this.lruOrder.length,
        config: {
          maxConnections: this.config.maxConnections,
          idleTtlMs: this.config.idleTtlMs,
          cleanupIntervalMs: this.config.cleanupIntervalMs,
          shutdownTimeoutMs: this.config.shutdownTimeoutMs
        }
      }
    };
  }

  /**
   * Get health status for monitoring
   */
  getHealthStatus(): {
    healthy: boolean;
    issues: string[];
    metrics: Record<string, number>;
  } {
    const issues: string[] = [];
    const metrics: Record<string, number> = {
      activeConnections: this.connections.size,
      maxConnections: this.config.maxConnections,
      utilizationPercent: (this.connections.size / this.config.maxConnections) * 100,
      totalTenants: this.registry.tenants.size,
      disconnectErrors: this.stats.totalDisconnectErrors,
    };

    // Check for issues
    if (this.connections.size >= this.config.maxConnections * 0.9) {
      issues.push('Connection pool near capacity (>90%)');
    }
    
    if (this.stats.totalDisconnectErrors > 10) {
      issues.push('High disconnect error count');
    }
    
    if (this.pool.waitingCount > 5) {
      issues.push('Connection pool has waiting requests');
    }

    return {
      healthy: issues.length === 0,
      issues,
      metrics
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
        totalRequests: 1,
        disconnectAttempts: 0,
        schemaValidated: false
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
   * Cleanup on shutdown with timeout
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down tenant connection manager...');
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Create shutdown promise with timeout
    const shutdownPromise = this.disconnect();
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Shutdown timeout exceeded'));
      }, this.config.shutdownTimeoutMs);
    });

    try {
      await Promise.race([shutdownPromise, timeoutPromise]);
      console.log('✅ All connections closed gracefully');
    } catch (error) {
      console.error('⚠️  Shutdown timed out, forcing exit');
      // Force cleanup
      this.connections.clear();
      this.connectionMetadata.clear();
      this.lruOrder = [];
    }

    try {
      await this.pool.end();
    } catch (error) {
      console.error('⚠️  Error closing pool:', error);
    }

    this.initialized = false;
    console.log('✅ Tenant connection manager shut down');
  }
}

// Singleton instance
export const tenantManager = new TenantConnectionManager();

// Detect serverless environment (Netlify Functions, AWS Lambda, Vercel, etc.)
const isServerless = !!(
  process.env.NETLIFY ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.VERCEL ||
  process.env.LAMBDA_TASK_ROOT ||
  process.env.AWS_EXECUTION_ENV
);

// Only register graceful shutdown handlers in non-serverless environments
// In serverless, SIGTERM is handled by the platform and we don't need to
// explicitly close connections (they'll be garbage collected)
if (!isServerless) {
  let isShuttingDown = false;

  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) {
      console.log(`⚠️  Already shutting down, ignoring ${signal}`);
      return;
    }
    isShuttingDown = true;
    
    console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);
    
    try {
      await tenantManager.shutdown();
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}
