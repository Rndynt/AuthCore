/**
 * Feature Flags for AuthCore
 * 
 * Conditional features that can be enabled/disabled based on
 * deployment needs and operational mode.
 */

import { AuthConfig } from './auth-mode';
import { devEnabled } from './env.js';

export interface FeatureFlags {
  /**
   * Enable multi-tenant registry tables (tenants, applications)
   */
  tenantRegistry: boolean;

  /**
   * Enable nested tenancy tables (application_sub_tenants)
   */
  nestedTenancy: boolean;

  /**
   * Enable tenant middleware for request routing
   */
  tenantMiddleware: boolean;

  /**
   * Enable development endpoints for testing
   */
  devEndpoints: boolean;

  /**
   * Enable audit logging
   */
  auditLog: boolean;
}

/**
 * Derive feature flags from AuthConfig
 */
export function getFeatureFlags(config: AuthConfig): FeatureFlags {
  return {
    // Tenant registry only needed in multi mode
    tenantRegistry: config.mode === 'multi',

    // Nested tenancy requires multi mode + explicit enable
    nestedTenancy: config.mode === 'multi' && config.nestedTenancyEnabled,

    // Tenant middleware only in multi mode
    tenantMiddleware: config.mode === 'multi',

    // Dev endpoints can be enabled in any mode
    devEndpoints: devEnabled,

    // Audit log always enabled for security
    auditLog: true
  };
}

/**
 * Display active features
 */
export function displayFeatureFlags(flags: FeatureFlags): void {
  console.log('🎯 Active Features:');
  console.log(`   Tenant Registry: ${flags.tenantRegistry ? '✅' : '❌'}`);
  console.log(`   Nested Tenancy: ${flags.nestedTenancy ? '✅' : '❌'}`);
  console.log(`   Tenant Middleware: ${flags.tenantMiddleware ? '✅' : '❌'}`);
  console.log(`   Dev Endpoints: ${flags.devEndpoints ? '✅' : '❌'}`);
  console.log(`   Audit Log: ${flags.auditLog ? '✅' : '❌'}`);
  console.log('');
}
