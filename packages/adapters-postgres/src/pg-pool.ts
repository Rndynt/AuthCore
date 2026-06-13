import pkg from 'pg';
import { env, POOL_CONFIG } from '../../config/src/env.js';
const { Pool } = pkg;
export function createPgPool() {
  return new Pool({
    connectionString: env.DATABASE_URL,
    max: POOL_CONFIG.max,
    idleTimeoutMillis: POOL_CONFIG.idleTimeoutMillis,
    connectionTimeoutMillis: POOL_CONFIG.connectionTimeoutMillis,
  });
}
export type { Pool, PoolClient } from 'pg';
