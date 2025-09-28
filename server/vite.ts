import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import type { FastifyInstance } from "fastify";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "fastify") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Fastify-compatible Vite setup
export async function setupVite(app: FastifyInstance, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // Register Vite dev middleware for assets
  app.get("/@vite/*", async (request, reply) => {
    const req = {
      ...request.raw,
      url: request.url,
      method: request.method,
      headers: request.headers,
    };
    const res = {
      ...reply.raw,
      setHeader: (name: string, value: string) => reply.header(name, value),
      end: (data: string) => reply.send(data),
    };
    
    return new Promise((resolve, reject) => {
      vite.middlewares(req as any, res as any, (err?: Error) => {
        if (err) reject(err);
        else resolve(undefined);
      });
    });
  });

  // Handle frontend SPA routing - catch all non-API routes
  app.get("/*", { preHandler: async (request, reply) => {
    // Skip API routes
    if (request.url.startsWith("/api")) {
      return;
    }
  }}, async (request, reply) => {
    const url = request.url;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      reply.header("Content-Type", "text/html").send(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      reply.status(500).send({ error: "Internal Server Error" });
    }
  });
}

export async function serveStatic(app: FastifyInstance) {
  const distPath = path.resolve(import.meta.dirname, "..", "dist", "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Register static file serving
  await app.register(require('@fastify/static'), {
    root: distPath,
    prefix: '/', // optional: default '/'
  });

  // fall through to index.html if the file doesn't exist (SPA routing)
  app.get("/*", { preHandler: async (request, reply) => {
    // Skip API routes
    if (request.url.startsWith("/api")) {
      return;
    }
  }}, async (request, reply) => {
    const indexPath = path.resolve(distPath, "index.html");
    reply.header("Content-Type", "text/html").send(await fs.promises.readFile(indexPath, "utf-8"));
  });
}
