import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import type { TenantRequest } from "../multi-tenant/middleware.js";

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
};

export default fp(requestLoggerPlugin, {
  name: "request-logger"
});
