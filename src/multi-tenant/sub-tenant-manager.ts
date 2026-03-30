/**
 * Sub-Tenant Manager
 * 
 * Manages nested tenancy - sub-tenants within applications.
 * Only used when NESTED_TENANCY_ENABLED=true
 */

import pkg from 'pg';
import type { Pool as PoolType } from 'pg';
const { Pool } = pkg;

export interface SubTenant {
  id: string;
  application_id: string;
  name: string;
  slug: string;
  organization_id: string | null;
  isolation_mode: 'schema' | 'organization';
  metadata: Record<string, any>;
  status: 'active' | 'suspended' | 'deleted';
  created_at: Date;
  updated_at: Date;
}

export interface SubTenantRegistry {
  subTenants: Map<string, SubTenant>;
  slugToSubTenantId: Map<string, string>;
  applicationSubTenants: Map<string, string[]>; // application_id -> sub-tenant IDs
}

export class SubTenantManager {
  private registry: SubTenantRegistry = {
    subTenants: new Map(),
    slugToSubTenantId: new Map(),
    applicationSubTenants: new Map()
  };
  private initialized = false;
  private pool: PoolType;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  /**
   * Initialize sub-tenant registry from database
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('⚠️ Sub-tenant manager already initialized');
      return;
    }

    try {
      console.log('🔄 Loading sub-tenant registry...');
      
      const result = await this.pool.query<SubTenant>(`
        SELECT 
          id, application_id, name, slug, organization_id,
          isolation_mode, metadata, status, created_at, updated_at
        FROM public.application_sub_tenants
        WHERE status = 'active'
        ORDER BY created_at ASC
      `);

      for (const row of result.rows) {
        const subTenant: SubTenant = {
          ...row,
          metadata: row.metadata || {}
        };
        
        this.registry.subTenants.set(subTenant.id, subTenant);
        this.registry.slugToSubTenantId.set(subTenant.slug, subTenant.id);
        
        // Group by application
        const appSubTenants = this.registry.applicationSubTenants.get(subTenant.application_id) || [];
        appSubTenants.push(subTenant.id);
        this.registry.applicationSubTenants.set(subTenant.application_id, appSubTenants);
      }

      this.initialized = true;
      console.log(`✅ Loaded ${this.registry.subTenants.size} active sub-tenants`);
      
      // Display sub-tenants per application
      this.registry.applicationSubTenants.forEach((subTenantIds, appId) => {
        console.log(`   📁 ${appId}: ${subTenantIds.length} sub-tenant(s)`);
      });
    } catch (error: any) {
      if (error?.code === '42P01') {
        console.error('❌ Sub-tenant registry table not found. Ensure nested tenancy migrations are applied.');
      } else {
        console.error('❌ Failed to load sub-tenant registry:', error);
      }
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Get sub-tenant by ID
   */
  getSubTenant(subTenantId: string): SubTenant | undefined {
    if (!this.initialized) {
      throw new Error('Sub-tenant manager not initialized');
    }
    return this.registry.subTenants.get(subTenantId);
  }

  /**
   * Get sub-tenant by slug
   */
  getSubTenantBySlug(slug: string): SubTenant | undefined {
    if (!this.initialized) {
      throw new Error('Sub-tenant manager not initialized');
    }
    const id = this.registry.slugToSubTenantId.get(slug);
    return id ? this.registry.subTenants.get(id) : undefined;
  }

  /**
   * Get all sub-tenants for an application
   */
  getApplicationSubTenants(applicationId: string): SubTenant[] {
    if (!this.initialized) {
      throw new Error('Sub-tenant manager not initialized');
    }
    
    const subTenantIds = this.registry.applicationSubTenants.get(applicationId) || [];
    return subTenantIds
      .map(id => this.registry.subTenants.get(id))
      .filter((st): st is SubTenant => st !== undefined);
  }

  /**
   * Reload sub-tenant registry
   */
  async reload(): Promise<void> {
    console.log('🔄 Reloading sub-tenant registry...');
    
    this.registry.subTenants.clear();
    this.registry.slugToSubTenantId.clear();
    this.registry.applicationSubTenants.clear();
    
    this.initialized = false;
    await this.initialize();
    
    console.log('✅ Sub-tenant registry reloaded');
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    await this.pool.end();
    console.log('✅ Sub-tenant manager disconnected');
  }
}
