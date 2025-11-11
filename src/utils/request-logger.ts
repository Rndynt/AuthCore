import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import type { TenantRequest } from "../multi-tenant/middleware.js";
import { emitLogEvent } from "./log-stream.js";

export interface RequestLogContext {
  startedAt: number;
  tenantId: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    requestLog?: RequestLogContext;
  }
}

const requestLoggerPlugin: FastifyPluginAsync = async fastify => {
  fastify.addHook("onRequest", async request => {
    const tenantRequest = request as TenantRequest;

    request.requestLog = {
      startedAt: Date.now(),
      tenantId: tenantRequest.tenantId ?? null
    };
  });

  fastify.addHook("preHandler", async request => {
    if (!request.requestLog) {
      request.requestLog = {
        startedAt: Date.now(),
        tenantId: null
      };
    }

    const tenantRequest = request as TenantRequest;

    if (tenantRequest.tenantId) {
      request.requestLog.tenantId = tenantRequest.tenantId;
    }
  });

  fastify.addHook("onResponse", async (request, reply) => {
    const context = request.requestLog ?? {
      startedAt: Date.now(),
      tenantId: null
    };

    const duration = Date.now() - context.startedAt;

    emitLogEvent({
      id: String(request.id),
      timestamp: new Date().toISOString(),
      level: "info",
      message: "request.completed",
      context: {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        duration,
        tenantId: context.tenantId,
        ip: request.ip,
        userAgent: request.headers["user-agent"] as string | undefined
      }
    });
  });
};

export default fp(requestLoggerPlugin, {
  name: "request-logger"
});
