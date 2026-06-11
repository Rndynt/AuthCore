import pkg from 'pg';
import { env, POOL_CONFIG } from '../../../src/env';
const { Pool } = pkg;
export function createPgPool() { return new Pool({ connectionString: env.DATABASE_URL, max: POOL_CONFIG.max, idleTimeoutMillis: POOL_CONFIG.idleTimeoutMillis, connectionTimeoutMillis: POOL_CONFIG.connectionTimeoutMillis }); }
export type { PoolClient } from 'pg';
