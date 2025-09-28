import Fastify from "fastify";
import cors from "@fastify/cors";
import { auth } from "../src/auth.js";
import { env, trustedOrigins } from "../src/env.js";
import { setupVite, serveStatic, log } from "./vite.js";

const app = Fastify({ logger: true });

// Register CORS
app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    cb(null, trustedOrigins.includes(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "x-api-key"]
});

// Request logging middleware
app.addHook('onRequest', async (request, reply) => {
  (request as any).startTime = Date.now();
});

app.addHook('onResponse', async (request, reply) => {
  const duration = Date.now() - ((request as any).startTime || Date.now());
  const path = request.url;
  
  if (path.startsWith("/api")) {
    let logLine = `${request.method} ${path} ${reply.statusCode} in ${duration}ms`;
    
    if (logLine.length > 80) {
      logLine = logLine.slice(0, 79) + "…";
    }
    
    log(logLine);
  }
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
    reply.send(await res.text().catch(() => ""));
  }
});

// Helper route to resolve current session (cookie/x-api-key/bearer)
app.get("/me", async (req, reply) => {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  reply.send(await auth.api.getSession({ headers }));
});

// Error handler
app.setErrorHandler((error, request, reply) => {
  const status = error.statusCode || 500;
  const message = error.message || "Internal Server Error";
  
  reply.status(status).send({ message });
  app.log.error(error);
});

(async () => {
  try {
    // Convert Fastify instance to Node.js server for Vite integration
    const server = app.server;

    // Setup Vite or static serving
    if (process.env.NODE_ENV === "development") {
      await setupVite(app as any, server);
    } else {
      serveStatic(app as any);
    }

    // Start the server
    const port = parseInt(process.env.PORT || '5000', 10);
    await app.listen({ host: "0.0.0.0", port });
    log(`Auth service running on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
})();