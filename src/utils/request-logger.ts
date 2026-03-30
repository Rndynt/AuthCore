import { randomUUID } from "node:crypto";
import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { TenantRequest } from "../multi-tenant/middleware.js";
import { emitLogEvent } from "./log-stream.js";
import { recordCompletedRequest } from "./request-metrics.js";
import { metricsStore } from "./metrics-store.js";

export interface RequestLogContext {
  startedAt: number;
  tenantId: string | null;
  method: string;
  url: string;
  ip: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

declare module "fastify" {
  interface FastifyRequest {
    requestLog?: RequestLogContext;
  }
}

const requestLoggerPlugin: FastifyPluginAsync = async fastify => {
  const ensureRequestLog = (request: FastifyRequest): RequestLogContext => {
    if (request.requestLog) {
      return request.requestLog;
    }

    const requestLog: RequestLogContext = {
      startedAt: Date.now(),
      tenantId: null,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers["user-agent"] as string | undefined
    };

    request.requestLog = requestLog;
    return requestLog;
  };

  fastify.addHook("onRequest", async request => {
    const tenantRequest = request as TenantRequest;

    request.requestLog = {
      startedAt: Date.now(),
      tenantId: tenantRequest.tenantId ?? null,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers["user-agent"] as string | undefined
    };
  });

  fastify.addHook("preHandler", async request => {
    const requestLog = ensureRequestLog(request);

    const tenantRequest = request as TenantRequest;

    if (tenantRequest.tenantId) {
      requestLog.tenantId = tenantRequest.tenantId;
    }
  });

  fastify.addHook("onResponse", async (request, reply) => {
    const requestLog = ensureRequestLog(request);
    const durationMs = Math.max(0, Date.now() - requestLog.startedAt);

    recordCompletedRequest({
      method: requestLog.method,
      statusCode: reply.statusCode,
      durationMs
    });

    // Record for metrics dashboard
    metricsStore.recordRequest(reply.statusCode, durationMs, requestLog.tenantId || undefined);

    const statusCode = reply.statusCode;
    const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";

    emitLogEvent({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      message: `${requestLog.method} ${requestLog.url} ${statusCode}`,
      context: {
        method: requestLog.method,
        url: requestLog.url,
        statusCode,
        duration: durationMs,
        tenantId: requestLog.tenantId,
        ip: requestLog.ip,
        userAgent: requestLog.userAgent,
        ...(requestLog.metadata ?? {})
      }
    });
  });
};

export default fp(requestLoggerPlugin, {
  name: "request-logger"
});
