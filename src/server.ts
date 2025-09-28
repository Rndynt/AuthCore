import Fastify from "fastify";
import cors from "@fastify/cors";
import { auth } from "./auth.js";
import { env, trustedOrigins } from "./env.js";

const app = Fastify({ logger: true });

app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const ok = trustedOrigins.includes(origin);
    cb(null, ok);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "x-api-key"]
});

app.setErrorHandler((err, _req, reply) => {
  app.log.error({ err }, 'unhandled-error');
  reply.status(err.statusCode ?? 500).send({ error: 'internal_error' });
});

app.ready(() => {
  console.log(`Auth service running on port ${env.PORT}`);
});

// Catch-all route for better-auth
app.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  handler: async (request, reply) => {
    const base = `http://${request.headers.host}`;
    const url = new URL(request.url, base);
    const headers = new Headers();
    for (const [k, v] of Object.entries(request.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }

    const body = request.body
      ? (typeof request.body === "string" ? request.body : JSON.stringify(request.body))
      : undefined;

    const res = await auth.handler(new Request(url.toString(), {
      method: request.method,
      headers,
      body
    }));

    reply.status(res.status);
    res.headers.forEach((val, key) => reply.header(key, val));
    const text = await res.text().catch(() => "");
    reply.send(text);
  }
});

// Health check route
app.get("/healthz", async (req, reply) => {
  reply.send({ ok: true });
});

// Helper route to resolve current session (cookie/x-api-key/bearer)
app.get("/me", async (req, reply) => {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const session = await auth.api.getSession({ headers });
  reply.send(session);
});

const startServer = async () => {
  try {
    await app.listen({ host: "0.0.0.0", port: env.PORT });
    app.log.info(`Auth service running on port ${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

startServer();