/**
 * AppConfig — single typed configuration object for the composition root.
 * Pulls from src/env and src/config so those modules remain the single source of truth.
 */

import { env, trustedOrigins, devEnabled, POOL_CONFIG } from '../../../src/env.js';
import { getAuthConfig } from '../../../src/config/auth-mode.js';
import { getFeatureFlags } from '../../../src/config/features.js';

export interface AppConfig {
  host: string;
  port: number;
  databaseUrl: string;
  trustedOrigins: string[];
  devEnabled: boolean;
  poolConfig: typeof POOL_CONFIG;
  authConfig: ReturnType<typeof getAuthConfig>;
  featureFlags: ReturnType<typeof getFeatureFlags>;
  nodeEnv: string;
}

export function loadAppConfig(): AppConfig {
  return {
    host: env.HOST ?? '0.0.0.0',
    port: env.PORT ?? 5000,
    databaseUrl: env.DATABASE_URL,
    trustedOrigins,
    devEnabled,
    poolConfig: POOL_CONFIG,
    authConfig: getAuthConfig(),
    featureFlags: getFeatureFlags(),
    nodeEnv: process.env.NODE_ENV ?? 'development',
  };
}
