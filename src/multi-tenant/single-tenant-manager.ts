/**
 * Single-Tenant Manager
 * 
 * Manages AuthCore when running in single-tenant mode.
 * No tenant registry needed - directly connects to one fixed tenant schema.
 */

import prismaPkg from '@prisma/client';

// Handle both CommonJS and ESM builds of @prisma/client
const { PrismaClient } = (prismaPkg as { PrismaClient?: typeof prismaPkg.PrismaClient }) ?? {};

if (!PrismaClient) {
  throw new Error("@prisma/client did not expose PrismaClient");
}

export class SingleTenantManager {
  private client: PrismaClient | null = null;
  private tenantId: string;
  private schemaName: string;
  private initialized = false;

  constructor(tenantId: string, schemaName: string = 'public') {
    this.tenantId = tenantId;
    this.schemaName = schemaName;
  }

  /**
   * Initialize single-tenant connection
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('⚠️ Single-tenant manager already initialized');
      return;
    }

    try {
      console.log(`🔄 Initializing single-tenant mode...`);
      console.log(`   Tenant ID: ${this.tenantId}`);
      console.log(`   Schema: ${this.schemaName}`);

      const dbUrl = this.buildSchemaUrl();
      
      this.client = new PrismaClient({
        datasources: {
          db: {
            url: dbUrl
          }
        },
        log: process.env.NODE_ENV === 'development' 
          ? ['error', 'warn'] 
          : ['error']
      });

      // Test connection
      await this.client.$connect();
      
      this.initialized = true;
      console.log(`✅ Single-tenant mode initialized: ${this.tenantId} (${this.schemaName})`);
    } catch (error) {
      console.error('❌ Failed to initialize single-tenant mode:', error);
      throw error;
    }
  }

  /**
   * Get the Prisma client for this tenant
   */
  getClient(): PrismaClient {
    if (!this.initialized || !this.client) {
      throw new Error('Single-tenant manager not initialized. Call initialize() first.');
    }
    return this.client;
  }

  /**
   * Get tenant information
   */
  getTenantInfo() {
    return {
      id: this.tenantId,
      schema: this.schemaName
    };
  }

  /**
   * Build database URL with schema
   */
  private buildSchemaUrl(): string {
    const baseUrl = process.env.DATABASE_URL;
    if (!baseUrl) {
      throw new Error('DATABASE_URL environment variable not set');
    }

    // If schema is public, use base URL as-is
    if (this.schemaName === 'public') {
      return baseUrl;
    }

    // Add schema parameter for non-public schemas
    const url = new URL(baseUrl);
    url.searchParams.set('schema', this.schemaName);
    return url.toString();
  }

  /**
   * Disconnect client
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.$disconnect();
      console.log(`✅ Single-tenant connection disconnected`);
    }
  }
}
