FROM node:20-alpine

RUN apk add --no-cache openssl curl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:4000/healthz || exit 1

CMD ["npx", "tsx", "src/server.ts"]
