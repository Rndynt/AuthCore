/**
 * Admin API Routes
 * All routes for admin dashboard
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Readable } from "node:stream";
import { adminAuth } from './auth.js';
import { createAdminApiHandlers } from "./admin-api.js";
import { getRequestOrigin } from '../utils/http.js';
import { tenantService } from "../application/tenant-service.js";
import { tenantManager } from "../multi-tenant/connection-manager.js";
import { addLogListener, removeLogListener } from "../utils/log-stream.js";

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

function buildAdminRequest(request: FastifyRequest): Request {
  const base = getRequestOrigin(request);
  const url = new URL(request.url, base);
  const headers = toHeaders(request.headers);
  const body = request.body
    ? (typeof request.body === "string" ? request.body : JSON.stringify(request.body))
    : undefined;

  return new Request(url.toString(), {
    method: request.method,
    headers,
    body
  });
}

async function sendWebResponse(reply: FastifyReply, response: Response) {
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    reply.header(key, value);
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream") && response.body) {
    reply.hijack();
    const readable = Readable.fromWeb(response.body as any);
    readable.pipe(reply.raw);
    return;
  }

  if (!response.body) {
    reply.send();
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  reply.send(buffer);
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
  
  const { handleAdminApiRequest, handleAdminLogStream } = createAdminApiHandlers({
    adminAuth,
    tenantService,
    tenantManager,
    addLogListener,
    removeLogListener
  });

  const handleAdminApiRoute = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const response = await handleAdminApiRequest(buildAdminRequest(request), { ip: request.ip });
      if (!response) {
        reply.code(404).send({ error: "Not Found" });
        return;
      }
      await sendWebResponse(reply, response);
    } catch (error) {
      // Handle errors properly
      if (error instanceof Response) {
        await sendWebResponse(reply, error);
        return;
      }
      console.error('[Admin API Route] Error:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  };

  const handleAdminLogRoute = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const response = await handleAdminLogStream(buildAdminRequest(request), { ip: request.ip });
      if (!response) {
        reply.code(404).send({ error: "Not Found" });
        return;
      }
      await sendWebResponse(reply, response);
    } catch (error) {
      if (error instanceof Response) {
        await sendWebResponse(reply, error);
        return;
      }
      console.error('[Admin Log Route] Error:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  };

  app.route({
    method: ["GET", "POST", "PUT", "DELETE"],
    url: "/admin/api",
    handler: handleAdminApiRoute
  });

  app.route({
    method: ["GET", "POST", "PUT", "DELETE"],
    url: "/admin/api/*",
    handler: handleAdminApiRoute
  });

  app.route({
    method: "GET",
    url: "/admin/log-stream",
    handler: handleAdminLogRoute
  });
  
  console.log('✅ Admin routes registered');
}
