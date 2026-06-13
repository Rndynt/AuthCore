import { env, trustedOrigins, devEnabled, POOL_CONFIG } from '../../../packages/config/src/env.js';
import { getAuthConfig } from '../../../packages/config/src/auth-mode.js';
import { getFeatureFlags } from '../../../packages/config/src/features.js';

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
  const authConfig = getAuthConfig();
  return {
    host: process.env.HOST ?? '0.0.0.0',
    port: env.PORT ?? 5000,
    databaseUrl: env.DATABASE_URL,
    trustedOrigins,
    devEnabled,
    poolConfig: POOL_CONFIG,
    authConfig,
    featureFlags: getFeatureFlags(authConfig),
    nodeEnv: process.env.NODE_ENV ?? 'development',
  };
}
