import test from "node:test";
import assert from "node:assert/strict";
import fastify from "fastify";
import requestLogger from "../src/utils/request-logger.js";
import { getRequestMetricsSnapshot, resetRequestMetrics } from "../src/utils/request-metrics.js";

test("getRequestMetricsSnapshot increases after request", async () => {
  resetRequestMetrics();

  const app = fastify();
  await app.register(requestLogger);
  app.get("/health", async () => ({ ok: true }));

  const before = getRequestMetricsSnapshot().counters.totalResponses;
  await app.inject({ method: "GET", url: "/health" });
  const after = getRequestMetricsSnapshot().counters.totalResponses;

  assert.equal(after, before + 1);
  await app.close();
});
