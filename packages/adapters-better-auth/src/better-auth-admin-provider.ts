import { adminAuth } from '../../../src/admin/auth.js';
import type { AdminAuthProvider } from '../../core/src/ports/admin-auth-provider';

/**
 * BetterAuthAdminProvider
 *
 * Adapter that wraps the Better Auth admin instance as the AdminAuthProvider port.
 * This is the only file in packages/ that is allowed to import from src/admin/auth.
 */
export class BetterAuthAdminProvider implements AdminAuthProvider {
  async handler(request: Request): Promise<Response> {
    return adminAuth.handler(request);
  }

  get api() {
    return adminAuth.api as { getSession(input: { headers: Headers }): Promise<any> };
  }
}

export const betterAuthAdminProvider = new BetterAuthAdminProvider();
