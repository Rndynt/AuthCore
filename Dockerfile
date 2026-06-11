FROM node:20-alpine AS deps
RUN apk add --no-cache openssl curl
WORKDIR /app
COPY package.json package-lock.json ./
COPY admin-ui/package.json admin-ui/package-lock.json ./admin-ui/
RUN npm ci && npm --prefix admin-ui ci

FROM deps AS build
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runtime
RUN apk add --no-cache openssl curl
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/admin-ui/out ./admin-ui/out
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT:-5000}/healthz || exit 1
CMD ["node", "dist/apps/api/src/main.js"]
