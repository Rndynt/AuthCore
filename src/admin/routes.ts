/**
 * Admin API Routes
 * All routes for admin dashboard
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { adminAuth } from './auth.js';
import { adminSessionMiddleware, AdminRequest } from './middleware.js';
import { tenantService } from './tenant-service.js';

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
      const url = new URL(request.url.replace('/admin/auth', '/api/auth'), `http://${request.headers.host}`);
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
      
      reply.send({ tenants });
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
      
      reply.send({ tenant });
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
        tenant,
        message: 'Tenant created successfully. Schema provisioning in progress.'
      });
    } catch (error) {
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
  // Audit Log Routes
  // ==========================
  
  // Get audit logs
  app.get('/admin/api/audit-logs', {
    preHandler: adminSessionMiddleware
  }, async (req: AdminRequest, reply) => {
    try {
      const { limit = '50', offset = '0' } = req.query as any;
      
      // TODO: Implement audit log retrieval
      // For now, return empty array
      reply.send({ logs: [], total: 0 });
    } catch (error) {
      console.error('[Admin API] Get audit logs error:', error);
      reply.code(500).send({ error: 'Failed to get audit logs' });
    }
  });
  
  console.log('✅ Admin routes registered');
}
