import { adminAuth } from './admin-auth-instance.js';
import type { AdminAuthProvider } from '../../core/src/ports/admin-auth-provider';

export class BetterAuthAdminProvider implements AdminAuthProvider {
  async handler(request: Request): Promise<Response> {
    return adminAuth.handler(request);
  }
  get api() {
    return adminAuth.api as { getSession(input: { headers: Headers }): Promise<any> };
  }
}

export const betterAuthAdminProvider = new BetterAuthAdminProvider();
