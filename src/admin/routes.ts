/**
 * Admin API Routes
 * All routes for admin dashboard
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { adminAuth } from './auth.js';
import { adminSessionMiddleware, AdminRequest } from './middleware.js';
import { tenantService, TenantValidationError, type SecuritySettings, type Tenant } from './tenant-service.js';
import { getRequestOrigin } from '../utils/http.js';

/**
 * Convert Fastify headers to Web Headers
 */
function toHeaders(headers: any): Headers {
  const webHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value) {
      webHeaders.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
  }
  return webHeaders;
}

function serializeTenant(tenant: Tenant) {
  const createdAt = tenant.created_at instanceof Date
    ? tenant.created_at.toISOString()
    : tenant.created_at;
  const updatedAt = tenant.updated_at instanceof Date
    ? tenant.updated_at.toISOString()
    : tenant.updated_at;

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    schemaName: tenant.schema_name,
    metadata: tenant.metadata ?? {},
    createdAt,
    updatedAt
  };
}

/**
 * Register all admin routes
 */
export async function registerAdminRoutes(app: FastifyInstance) {
  console.log('📋 Registering admin routes...');
  
  // ==========================
  // Admin Authentication Routes
  // ==========================
  
  // Forward all /admin/auth/* requests to Better Auth admin instance
  app.route({
    method: ["GET", "POST", "PUT", "DELETE"],
    url: "/admin/auth/*",
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const base = getRequestOrigin(request);
      const url = new URL(request.url.replace('/admin/auth', '/api/auth'), base);
      const headers = toHeaders(request.headers);
      
      const body = request.body
        ? (typeof request.body === "string" ? request.body : JSON.stringify(request.body))
        : undefined;
      
      try {
        const res = await adminAuth.handler(new Request(url.toString(), {
          method: request.method,
          headers,
          body
        }));
        
        // Forward response
        reply.status(res.status);
        res.headers.forEach((val, key) => {
          reply.header(key, val);
        });
        
        const text = await res.text().catch(() => "");
        reply.send(text);
      } catch (error) {
        console.error('[Admin Auth] Error:', error);
        reply.code(500).send({ error: 'Internal server error' });
      }
    }
  });
  
  // ==========================
  // Protected Admin API Routes
  // ==========================
  
  // Get current admin user
  app.get('/admin/api/me', {
    preHandler: adminSessionMiddleware
  }, async (req: AdminRequest, reply) => {
    reply.send({
      user: req.adminUser,
      session: req.adminSession
    });
  });
  
  // ==========================
  // Tenant Management Routes
  // ==========================
  
  // List all tenants
  app.get('/admin/api/tenants', {
    preHandler: adminSessionMiddleware
  }, async (req: AdminRequest, reply) => {
    try {
      const tenants = await tenantService.listTenants();

      // Log audit
      await tenantService.logAuditAction(
        req.adminUser!.id,
        'list_tenants',
        'system',
        'all',
        { count: tenants.length },
        req.ip
      );

      reply.send({ tenants: tenants.map(serializeTenant) });
    } catch (error) {
      console.error('[Admin API] List tenants error:', error);
      reply.code(500).send({ error: 'Failed to list tenants' });
    }
  });
  
  // Get single tenant
  app.get('/admin/api/tenants/:id', {
    preHandler: adminSessionMiddleware
  }, async (req: AdminRequest, reply) => {
    try {
      const { id } = req.params as { id: string };
      const tenant = await tenantService.getTenant(id);

      if (!tenant) {
        return reply.code(404).send({ error: 'Tenant not found' });
      }

      reply.send({ tenant: serializeTenant(tenant) });
    } catch (error) {
      console.error('[Admin API] Get tenant error:', error);
      reply.code(500).send({ error: 'Failed to get tenant' });
    }
  });
  
  // Create new tenant
  app.post('/admin/api/tenants', {
    preHandler: adminSessionMiddleware
  }, async (req: AdminRequest, reply) => {
    try {
      const input = req.body as { id: string; name: string; slug: string };
      
      // Validate input
      if (!input.id || !input.name || !input.slug) {
        return reply.code(400).send({ 
          error: 'Missing required fields: id, name, slug' 
        });
      }
      
      const tenant = await tenantService.createTenant(input);

      // Log audit
      await tenantService.logAuditAction(
        req.adminUser!.id,
        'create_tenant',
        'tenant',
        tenant.id,
        { name: tenant.name, slug: tenant.slug },
        req.ip
      );

      reply.code(201).send({
        tenant: serializeTenant(tenant),
        message: 'Tenant created and provisioned successfully.'
      });
    } catch (error) {
      if (error instanceof TenantValidationError) {
        return reply.code(400).send({ error: error.message });
      }
      console.error('[Admin API] Create tenant error:', error);
      reply.code(500).send({ error: 'Failed to create tenant' });
    }
  });
  
  // Suspend tenant
  app.post('/admin/api/tenants/:id/suspend', {
    preHandler: adminSessionMiddleware
  }, async (req: AdminRequest, reply) => {
    try {
      const { id } = req.params as { id: string };
      
      await tenantService.suspendTenant(id);
      
      // Log audit
      await tenantService.logAuditAction(
        req.adminUser!.id,
        'suspend_tenant',
        'tenant',
        id,
        {},
        req.ip
      );
      
      reply.send({ message: 'Tenant suspended successfully' });
    } catch (error) {
      console.error('[Admin API] Suspend tenant error:', error);
      reply.code(500).send({ error: 'Failed to suspend tenant' });
    }
  });
  
  // Activate tenant
  app.post('/admin/api/tenants/:id/activate', {
    preHandler: adminSessionMiddleware
  }, async (req: AdminRequest, reply) => {
    try {
      const { id } = req.params as { id: string };
      
      await tenantService.activateTenant(id);
      
      // Log audit
      await tenantService.logAuditAction(
        req.adminUser!.id,
        'activate_tenant',
        'tenant',
        id,
        {},
        req.ip
      );
      
      reply.send({ message: 'Tenant activated successfully' });
    } catch (error) {
      console.error('[Admin API] Activate tenant error:', error);
      reply.code(500).send({ error: 'Failed to activate tenant' });
    }
  });
  
  // Delete tenant (soft delete)
  app.delete('/admin/api/tenants/:id', {
    preHandler: adminSessionMiddleware
  }, async (req: AdminRequest, reply) => {
    try {
      const { id } = req.params as { id: string };
      
      await tenantService.deleteTenant(id);
      
      // Log audit
      await tenantService.logAuditAction(
        req.adminUser!.id,
        'delete_tenant',
        'tenant',
        id,
        {},
        req.ip
      );
      
      reply.send({ message: 'Tenant deleted successfully' });
    } catch (error) {
      console.error('[Admin API] Delete tenant error:', error);
      reply.code(500).send({ error: 'Failed to delete tenant' });
    }
  });
  
  // Get tenant metrics
  app.get('/admin/api/tenants/:id/metrics', {
    preHandler: adminSessionMiddleware
  }, async (req: AdminRequest, reply) => {
    try {
      const { id } = req.params as { id: string };
      
      const metrics = await tenantService.getTenantMetrics(id);
      
      reply.send({ metrics });
    } catch (error) {
      console.error('[Admin API] Get tenant metrics error:', error);
      reply.code(500).send({ error: 'Failed to get tenant metrics' });
    }
  });
  
  // ==========================
  // System Metrics Routes
  // ==========================

  app.get('/admin/api/overview', {
    preHandler: adminSessionMiddleware
  }, async (_req: AdminRequest, reply) => {
    try {
      const overview = await tenantService.getAdminOverview();
      reply.send({ overview });
    } catch (error) {
      console.error('[Admin API] Get overview error:', error);
      reply.code(500).send({ error: 'Failed to load overview' });
    }
  });

  // Get system-wide metrics
  app.get('/admin/api/metrics', {
    preHandler: adminSessionMiddleware
  }, async (req: AdminRequest, reply) => {
    try {
      const metrics = await tenantService.getSystemMetrics();
      
      reply.send({ metrics });
    } catch (error) {
      console.error('[Admin API] Get system metrics error:', error);
      reply.code(500).send({ error: 'Failed to get system metrics' });
    }
  });

  // ==========================
  // Cross-tenant User Management
  // ==========================

  app.get('/admin/api/users/search', {
    preHandler: adminSessionMiddleware
  }, async (req: AdminRequest, reply) => {
    try {
      const { q = '', tenantId, limit } = req.query as { q?: string; tenantId?: string; limit?: string };
      const results = await tenantService.searchUsersAcrossTenants({
        query: q,
        tenantId,
        limit: limit ? parseInt(limit, 10) : undefined
      });

      await tenantService.logAuditAction(
        req.adminUser!.id,
        'search_users',
        'system',
        tenantId || 'all',
        { query: q, limit: limit ? parseInt(limit, 10) : undefined },
        req.ip
      );

      reply.send({ users: results });
    } catch (error) {
      if (error instanceof TenantValidationError) {
        return reply.code(400).send({ error: error.message });
      }
      console.error('[Admin API] Search users error:', error);
      reply.code(500).send({ error: 'Failed to search users' });
    }
  });

  app.post('/admin/api/tenants/:tenantId/users/:userId/revoke-sessions', {
    preHandler: adminSessionMiddleware
  }, async (req: AdminRequest, reply) => {
    try {
      const { tenantId, userId } = req.params as { tenantId: string; userId: string };
      const revoked = await tenantService.revokeUserSessions(tenantId, userId);

      await tenantService.logAuditAction(
        req.adminUser!.id,
        'revoke_user_sessions',
        'user',
        `${tenantId}:${userId}`,
        { revoked },
        req.ip
      );

      reply.send({ revoked });
    } catch (error) {
      console.error('[Admin API] Revoke user sessions error:', error);
      reply.code(500).send({ error: 'Failed to revoke user sessions' });
    }
  });

  app.post('/admin/api/tenants/:tenantId/users/:userId/support-session', {
    preHandler: adminSessionMiddleware
  }, async (req: AdminRequest, reply) => {
    try {
      const { tenantId, userId } = req.params as { tenantId: string; userId: string };
      const { minutes = 30 } = (req.body as { minutes?: number }) || {};

      const session = await tenantService.createSupportSession(tenantId, userId, minutes);

      await tenantService.logAuditAction(
        req.adminUser!.id,
        'create_support_session',
        'user',
        `${tenantId}:${userId}`,
        { minutes },
        req.ip
      );

      reply.send({ session });
    } catch (error) {
      console.error('[Admin API] Support session error:', error);
      reply.code(500).send({ error: 'Failed to create support session' });
    }
  });

  // ==========================
  // Security Configuration
  // ==========================

  app.get('/admin/api/security/settings', {
    preHandler: adminSessionMiddleware
  }, async (_req: AdminRequest, reply) => {
    try {
      const settings = await tenantService.getSecuritySettings();
      reply.send({ settings });
    } catch (error) {
      console.error('[Admin API] Get security settings error:', error);
      reply.code(500).send({ error: 'Failed to load security settings' });
    }
  });

  app.put('/admin/api/security/settings', {
    preHandler: adminSessionMiddleware
  }, async (req: AdminRequest, reply) => {
    try {
      const updates = req.body as Partial<SecuritySettings>;
      const settings = await tenantService.updateSecuritySettings(req.adminUser!.id, updates);

      await tenantService.logAuditAction(
        req.adminUser!.id,
        'update_security_settings',
        'system',
        'security',
        updates,
        req.ip
      );

      reply.send({ settings });
    } catch (error) {
      console.error('[Admin API] Update security settings error:', error);
      reply.code(500).send({ error: 'Failed to update security settings' });
    }
  });

  // ==========================
  // Audit Log Routes
  // ==========================

  // Get audit logs
  app.get('/admin/api/audit-logs', {
    preHandler: adminSessionMiddleware
  }, async (req: AdminRequest, reply) => {
    try {
      const {
        limit = '50',
        offset = '0',
        action,
        targetType,
        targetId,
        adminUserId,
        from,
        to,
        search
      } = req.query as any;

      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
      const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

      const auditLogs = await tenantService.getAuditLogs(limitNum, offsetNum, {
        action,
        targetType,
        targetId,
        adminUserId,
        from,
        to,
        search
      });

      reply.send(auditLogs);
    } catch (error) {
      console.error('[Admin API] Get audit logs error:', error);
      reply.code(500).send({ error: 'Failed to get audit logs' });
    }
  });
  
  console.log('✅ Admin routes registered');
}
