/**
 * AuthCore Mode Configuration
 * 
 * This module defines the operational modes for AuthCore:
 * - single: Standalone instance for one tenant/application
 * - multi: Multi-tenant instance supporting multiple applications
 */

export type AuthMode = 'single' | 'multi';

export interface AuthConfig {
  /**
   * Operating mode of AuthCore
   * - 'single': Single-tenant mode (dedicated instance)
   * - 'multi': Multi-tenant mode (shared instance)
   */
  mode: AuthMode;

  /**
   * Enable nested tenancy support (sub-tenants within tenants)
   * Only applicable when mode = 'multi'
   */
  nestedTenancyEnabled: boolean;

  /**
   * Fixed tenant ID when running in single-tenant mode
   * Required when mode = 'single'
   */
  singleTenantId?: string;

  /**
   * Fixed tenant schema when running in single-tenant mode
   * Defaults to 'public' if not specified
   */
  singleTenantSchema?: string;
}

/**
 * Load AuthCore configuration from environment variables
 */
export function getAuthConfig(): AuthConfig {
  const mode = (process.env.AUTH_MODE || 'multi') as AuthMode;
  const nestedEnabled = process.env.NESTED_TENANCY_ENABLED === 'true';
  
  // Validate single-tenant mode requirements
  if (mode === 'single' && !process.env.TENANT_ID) {
    throw new Error(
      'TENANT_ID environment variable is required when AUTH_MODE=single'
    );
  }

  // Nested tenancy only valid in multi mode
  if (mode === 'single' && nestedEnabled) {
    console.warn(
      '⚠️  NESTED_TENANCY_ENABLED ignored in single-tenant mode'
    );
  }

  const config: AuthConfig = {
    mode,
    nestedTenancyEnabled: mode === 'multi' && nestedEnabled,
    singleTenantId: process.env.TENANT_ID,
    singleTenantSchema: process.env.TENANT_SCHEMA || 'public'
  };

  return config;
}

/**
 * Display current configuration
 */
export function displayAuthConfig(config: AuthConfig): void {
  console.log('\n🔧 AuthCore Configuration:');
  console.log(`   Mode: ${config.mode.toUpperCase()}`);
  
  if (config.mode === 'single') {
    console.log(`   Tenant ID: ${config.singleTenantId}`);
    console.log(`   Schema: ${config.singleTenantSchema}`);
  } else {
    console.log(`   Nested Tenancy: ${config.nestedTenancyEnabled ? 'ENABLED' : 'DISABLED'}`);
  }
  
  console.log('');
}

/**
 * Validate configuration consistency
 */
export function validateAuthConfig(config: AuthConfig): void {
  if (config.mode === 'single') {
    if (!config.singleTenantId) {
      throw new Error('Single-tenant mode requires TENANT_ID to be set');
    }
  }
}
