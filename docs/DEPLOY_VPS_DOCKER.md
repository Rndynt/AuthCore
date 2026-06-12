# Deploy Realmio di VPS dengan Docker + Nginx/Coolify

## Daftar Isi

1. [Arsitektur (Post-P04)](#1-arsitektur)
2. [Route Map](#2-route-map)
3. [Persiapan VPS](#3-persiapan-vps)
4. [Build & Run Docker](#4-build--run-docker)
5. [Environment Variables](#5-environment-variables)
6. [Docker Compose](#6-docker-compose)
7. [Nginx Reverse Proxy](#7-nginx-reverse-proxy)
8. [SSL dengan Certbot](#8-ssl-dengan-certbot)
9. [Deploy di Coolify](#9-deploy-di-coolify)
10. [Langkah Deploy Step-by-Step](#10-langkah-deploy-step-by-step)
11. [Smoke Test](#11-smoke-test)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Arsitektur

```
Internet / Cloudflare
       │
       ▼
  Nginx (443/80)
  reverse proxy
       │
       ▼
  Realmio Container
  port 5000 (single service)
  ┌─────────────────────────────────────────────────────┐
  │  Fastify                                            │
  │  ├─ /admin           → dist/public (Next.js export) │
  │  ├─ /admin/api/*     → Admin API use cases          │
  │  ├─ /admin/auth/*    → Better Auth admin            │
  │  ├─ /api/auth/*      → Tenant auth                  │
  │  ├─ /tenant/*/api/auth/* → Explicit tenant auth     │
  │  ├─ /legacy/auth/*   → Deprecated auth compat       │
  │  └─ /healthz         → Health check                 │
  └─────────────────────────────────────────────────────┘
```

**Satu container, satu port.** Fastify melayani API sekaligus file statis Admin UI.

> ⚠️ Model lama (API port 4000 + Admin UI port lama (3000) + dua Dockerfile) **sudah dihapus** di P04.
> Jangan gunakan `admin-ui/Dockerfile`, `standalone output mode`, atau `NEXT_PUBLIC_API_URL`.

---

## 2. Route Map

| Path | Behaviour |
|---|---|
| `GET /` | 302 redirect → `/admin/` |
| `GET /admin` | Admin UI SPA (index.html) |
| `GET /admin/*` | Static file atau SPA index fallback |
| `GET /admin/api` | Admin API root (JSON) |
| `GET /admin/api/*` | Admin API routes (JSON) |
| `GET /admin/auth/*` | Better Auth admin endpoints |
| `GET /admin/log-stream` | SSE log stream (Fastify only; tidak tersedia di Netlify) |
| `GET /api/auth/*` | Tenant auth — tenant dari header `X-Tenant-Id` |
| `GET /tenant/:id/api/auth/*` | Tenant auth — tenant dari path prefix |
| `GET /legacy/auth/*` | Auth compat lama + header `Deprecation: true` |
| `GET /healthz` | Health check JSON |
| `GET /ready` | Readiness probe JSON |
| `GET /api/health` | Health alias |
| `GET /dev/*` | Dev endpoints (hanya jika `DEV_ENDPOINTS=true`) |

---

## 3. Persiapan VPS

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install -y docker.io docker-compose-plugin curl git
sudo systemctl enable --now docker
sudo usermod -aG docker $USER   # re-login setelah ini

# Verifikasi
docker --version
docker compose version
```

---

## 4. Build & Run Docker

### Build

```bash
git clone https://github.com/Rndynt/Realmio.git
cd Realmio
cp .env.example .env   # edit dulu sebelum build

docker build -t realmio:latest .
```

Build stages:
1. **deps** — install npm deps untuk API + admin-ui
2. **build** — `npx prisma generate` + `npm run build` (API TypeScript → dist/ + Next.js export → admin-ui/out/)
3. **runtime** — production node_modules + `dist/` + `admin-ui/out → dist/public/`

### Run (standalone)

```bash
docker run -d \
  --name realmio \
  -p 5000:5000 \
  --env-file .env \
  -e NODE_ENV=production \
  -e PORT=5000 \
  --restart unless-stopped \
  realmio:latest
```

### Verify

```bash
curl http://localhost:5000/healthz
# {"status":"ok","mode":"...","timestamp":"..."}

curl -I http://localhost:5000/admin
# HTTP/1.1 200 OK
# Content-Type: text/html
```

---

## 5. Environment Variables

File: `.env` (jangan commit ke git)

```env
# Database
DATABASE_URL=postgresql://user:pass@db:5432/realmio

# Better Auth secret (min 32 chars)
BETTER_AUTH_SECRET=your-secret-here-min-32-characters

# Auth URL — harus match dengan domain publik
BETTER_AUTH_URL=https://auth.yourdomain.com

# Trusted Origins (comma-separated)
TRUSTED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Server
PORT=5000
NODE_ENV=production
HOST=0.0.0.0

# Optional: Admin UI public base URL (tidak diperlukan jika sudah same-origin)
# NEXT_PUBLIC_API_URL=https://auth.yourdomain.com
```

> `NEXT_PUBLIC_API_URL` hanya diperlukan jika Admin UI dan API berada di domain berbeda.
> Dalam setup single-container standar, Admin UI menggunakan `window.location.origin` secara otomatis.

---

## 6. Docker Compose

```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: realmio_api
    restart: unless-stopped
    ports:
      - "127.0.0.1:5000:5000"
    env_file:
      - .env
    environment:
      NODE_ENV: production
      PORT: 5000
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - realmio_net

networks:
  realmio_net:
    driver: bridge
```

**Tidak ada service `admin-ui`** — Admin UI sudah di-bundle ke dalam image sebagai file statis di `dist/public/`.

---

## 7. Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/realmio
server {
    listen 80;
    server_name auth.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name auth.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/auth.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/auth.yourdomain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # Single upstream → single Fastify container
    location / {
        proxy_pass         http://127.0.0.1:5000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Forwarded-Host $host;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;

        # SSE log-stream support
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 3600s;
    }
}
```

> ⚠️ Jangan split routing antara `/` ke Next.js dan `/admin` ke API — sudah tidak diperlukan.
> Semua traffic cukup diarahkan ke satu container port 5000.

---

## 8. SSL dengan Certbot

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d auth.yourdomain.com
sudo systemctl reload nginx
```

Auto-renew:
```bash
sudo crontab -e
# Tambahkan:
0 12 * * * certbot renew --quiet && systemctl reload nginx
```

---

## 9. Deploy di Coolify

1. **New Service** → **Docker Compose** atau **Dockerfile**
2. Setting:
   - **Build Type**: `Dockerfile`
   - **Dockerfile path**: `Dockerfile`  ← root repo, bukan `admin-ui/Dockerfile`
   - **Port**: `5000`
   - **Health Check Path**: `/healthz`
3. **Environment Variables**: salin dari `.env`
4. **Tidak perlu** service terpisah untuk Admin UI
5. **Tidak perlu** Next.js preset atau runtime — admin-ui adalah file statis

---

## 10. Langkah Deploy Step-by-Step

```bash
# 1. Clone & konfigurasi
git clone https://github.com/Rndynt/Realmio.git
cd Realmio
cp .env.example .env
nano .env   # isi DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, TRUSTED_ORIGINS

# 2. Jalankan database (misal PostgreSQL via Docker)
docker run -d \
  --name realmio_db \
  -e POSTGRES_DB=realmio \
  -e POSTGRES_USER=realmio \
  -e POSTGRES_PASSWORD=secret \
  -p 5432:5432 \
  postgres:16-alpine

# 3. Migrate database
DATABASE_URL=postgresql://realmio:secret@localhost:5432/realmio \
  npx prisma migrate deploy

# 4. Build & jalankan via compose
docker compose up -d --build

# 5. Verifikasi
docker compose ps
curl http://localhost:5000/healthz
curl -I http://localhost:5000/admin

# 6. Smoke test lengkap
BASE_URL=http://localhost:5000 bash scripts/smoke-production-runtime.sh
```

---

## 11. Smoke Test

Script tersedia di `scripts/smoke-production-runtime.sh`:

```bash
# Test lokal
bash scripts/smoke-production-runtime.sh

# Test container yang sudah berjalan
BASE_URL=http://localhost:5000 bash scripts/smoke-production-runtime.sh

# Test production
BASE_URL=https://auth.yourdomain.com bash scripts/smoke-production-runtime.sh

# Via npm
npm run smoke:prod
```

---

## 12. Troubleshooting

### Container tidak mau start

```bash
docker compose logs api
```

Cek:
- `DATABASE_URL` benar dan database dapat dicapai
- `BETTER_AUTH_SECRET` minimal 32 karakter
- Port 5000 tidak terpakai: `ss -tlnp | grep 5000`

### `/admin` mengembalikan 500

Admin UI static files tidak ditemukan di `dist/public/index.html`.

```bash
docker exec realmio ls /app/dist/public/
```

Solusi: rebuild image (`docker build -t realmio:latest .`).

### API routes mengembalikan HTML

Menandakan SPA fallback salah menangkap API routes. Periksa `shouldServeAdminUi()` di `packages/server-fastify/src/routes/static-ui.routes.ts`.

### `/healthz` timeout

```bash
docker exec realmio curl -v http://localhost:5000/healthz
docker compose logs --tail=50 api
```

Cek apakah `DATABASE_URL` dapat dicapai dari dalam container.

---

*Dokumen ini diperbarui untuk P04 Option A (static Admin UI via Fastify) — Fase P05.*
