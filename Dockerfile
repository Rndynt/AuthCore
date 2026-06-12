# ─── Stage 1: Install dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache openssl curl
WORKDIR /app
COPY package.json package-lock.json ./
COPY admin-ui/package.json admin-ui/package-lock.json ./admin-ui/
RUN npm ci && npm --prefix admin-ui ci

# ─── Stage 2: Build everything ───────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN npx prisma generate
# Build API (TypeScript → dist/) and Admin UI (Next static export → admin-ui/out/)
RUN npm run build

# ─── Stage 3: Production runtime ─────────────────────────────────────────────
FROM node:20-alpine AS runtime
RUN apk add --no-cache openssl curl
WORKDIR /app
ENV NODE_ENV=production

# Production node_modules (no devDeps)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Compiled API server
COPY --from=build /app/dist ./dist

# Prisma client
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# Admin UI static export → exactly where Fastify static route looks
COPY --from=build /app/admin-ui/out ./dist/public

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT:-5000}/healthz || exit 1

# Single Fastify API runtime — serves both API and Admin UI static files
CMD ["node", "dist/apps/api/src/main.js"]
