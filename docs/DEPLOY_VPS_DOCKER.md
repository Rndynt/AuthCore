# Deploy Realmio di VPS dengan Docker + Nginx

## Daftar Isi
1. [Analisis Masalah (Root Cause)](#1-analisis-masalah)
2. [Arsitektur yang Benar](#2-arsitektur-yang-benar)
3. [Persiapan VPS](#3-persiapan-vps)
4. [Struktur File](#4-struktur-file)
5. [Dockerfile Backend (API)](#5-dockerfile-backend-api)
6. [Dockerfile Admin UI](#6-dockerfile-admin-ui)
7. [Docker Compose](#7-docker-compose)
8. [Environment Variables](#8-environment-variables)
9. [Nginx Configuration](#9-nginx-configuration)
10. [SSL dengan Certbot](#10-ssl-dengan-certbot)
11. [Langkah Deploy Step-by-Step](#11-langkah-deploy-step-by-step)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Analisis Masalah

### Kenapa login gagal di setup Anda sekarang?

**Masalah utama: Nginx routing salah**

Admin UI (`api-client.ts`) memanggil endpoint seperti:
- `POST /admin/auth/sign-in/email` — untuk login
- `GET /admin/auth/get-session` — untuk cek sesi
- `GET /admin/api/tenants` — untuk data tenant
- `GET /api/auth/*` — untuk auth tenant

Nginx config Anda saat ini:
```nginx
location /api/ {
    proxy_pass http://127.0.0.1:4000/;   # ✅ Benar untuk /api/auth/*
}
location /auth/ {
    proxy_pass http://127.0.0.1:4000/;   # ❌ Tidak dipakai oleh admin UI
}
location / {
    proxy_pass http://127.0.0.1:3000;    # ❌ /admin/* ikut ke sini → Next.js tidak bisa handle!
}
```

Akibatnya, request `/admin/auth/sign-in/email` jatuh ke location `/` → diteruskan ke Next.js (port 3000) → Next.js tidak punya route tersebut → **API tidak ditemukan / 404**.

**Solusi**: Tambah `location /admin/` yang mengarah ke backend (port 4000).

---

## 2. Arsitektur yang Benar

```
Internet (HTTPS)
      │
   Nginx (443/80)
      │
      ├── /admin/*          → Backend API (port 4000)
      ├── /api/*            → Backend API (port 4000)
      ├── /tenant/*         → Backend API (port 4000)
      ├── /me               → Backend API (port 4000)
      ├── /healthz          → Backend API (port 4000)
      ├── /dev/*            → Backend API (port 4000)
      ├── /legacy/*         → Backend API (port 4000)
      └── /                 → Admin UI (port 3000)
```

Backend (port 4000) menangani semua API request.  
Admin UI (port 3000) menangani semua halaman frontend.

---

## 3. Persiapan VPS

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install Nginx
yum install nginx -y          # CentOS/OpenCloudOS
# atau: apt install nginx -y  # Ubuntu/Debian

# Install Certbot
yum install certbot python3-certbot-nginx -y
# atau: apt install certbot python3-certbot-nginx -y

systemctl enable nginx
systemctl start nginx
```

---

## 4. Struktur File

Struktur direktori yang direkomendasikan di VPS:

```
/root/.openclaw/workspace/realmio-transity/
├── Dockerfile                  # Backend API
├── admin-ui/
│   ├── Dockerfile              # Admin UI
│   └── ...
├── docker-compose.yml          # Orchestration
├── .env                        # Backend env vars
└── admin-ui/.env.production    # Frontend env vars
```

---

## 5. Dockerfile Backend (API)

Ganti `Dockerfile` di root project menjadi versi yang lebih robust:

```dockerfile
# Dockerfile (Backend API)
FROM node:20-alpine

# Install dependencies untuk native modules
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install semua dependencies (termasuk devDependencies karena butuh tsx/prisma)
RUN npm install

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

EXPOSE 4000

# Gunakan tsx untuk menjalankan TypeScript langsung (tidak perlu build step)
CMD ["npx", "tsx", "src/server.ts"]
```

> **Catatan**: `tsx` digunakan karena project ini TypeScript dan tidak punya build output yang lengkap.  
> Untuk production yang lebih optimal, gunakan `npm run build` + `node dist/server.js`, tapi pastikan tsconfig build benar dulu.

---

## 6. Dockerfile Admin UI

Ganti `admin-ui/Dockerfile` menjadi:

```dockerfile
# admin-ui/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
RUN npm install

# Copy semua source
COPY . .

# Build Next.js (standalone atau static)
RUN npm run build

EXPOSE 3000

# Jalankan Next.js server (bukan static serve)
# Ini lebih reliable daripada 'serve out/'
CMD ["npm", "start"]
```

Dan pastikan `admin-ui/next.config.ts` menggunakan `standalone` output (bukan `export`), karena `export` punya keterbatasan dengan error pages:

```typescript
// admin-ui/next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',   // Ganti dari 'export' ke 'standalone'
};

export default nextConfig;
```

Dan update `package.json` di admin-ui agar `start` menjalankan Next.js:

```json
// admin-ui/package.json (bagian scripts)
{
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "next lint"
  }
}
```

---

## 7. Docker Compose

Buat/ganti file `docker-compose.yml`:

```yaml
version: '3.9'

services:
  # Backend API
  api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: realmio_api
    restart: unless-stopped
    ports:
      - "127.0.0.1:4000:4000"    # Hanya listen di localhost (keamanan)
    env_file:
      - .env
    environment:
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:4000/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Admin UI
  admin-ui:
    build:
      context: ./admin-ui
      dockerfile: Dockerfile
    container_name: realmio_admin_ui
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"    # Hanya listen di localhost (keamanan)
    env_file:
      - ./admin-ui/.env.production
    environment:
      - NODE_ENV=production
    depends_on:
      api:
        condition: service_healthy
```

---

## 8. Environment Variables

### Backend: `.env`

```bash
# Server
PORT=4000
NODE_ENV=production

# Auth (PENTING: ganti secret dengan nilai random yang aman)
BETTER_AUTH_URL=https://transity.realmio.web.id
BETTER_AUTH_SECRET=<ISI_DENGAN_RANDOM_STRING_MINIMAL_32_CHAR>

# CORS - daftar semua domain yang boleh akses API
TRUSTED_ORIGINS=https://transity.realmio.web.id,https://nusa-terminal.transity.web.id,https://buskita-terminal.transity.web.id

# Database
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Mode
AUTH_MODE=multi
NESTED_TENANCY_ENABLED=false

# Dev endpoints (matikan di production!)
ENABLE_DEV_ENDPOINTS=false
```

> Generate secret: `openssl rand -base64 32`

### Admin UI: `admin-ui/.env.production`

```bash
# URL API backend (dipakai untuk SSR fallback)
NEXT_PUBLIC_API_URL=https://transity.realmio.web.id
```

> **Penting**: Di browser, `api-client.ts` sudah menggunakan `window.location.origin` secara otomatis, jadi `NEXT_PUBLIC_API_URL` hanya digunakan saat SSR.

---

## 9. Nginx Configuration

Ini adalah konfigurasi **yang benar dan lengkap**. Ganti `/etc/nginx/conf.d/realmio.conf`:

```nginx
# /etc/nginx/conf.d/realmio.conf

# Redirect HTTP ke HTTPS
server {
    listen 80;
    server_name transity.realmio.web.id;
    return 301 https://$host$request_uri;
}

# HTTPS server
server {
    listen 443 ssl;
    server_name transity.realmio.web.id;

    # SSL (dikelola Certbot)
    ssl_certificate /etc/letsencrypt/live/transity.realmio.web.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/transity.realmio.web.id/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Ukuran request body (untuk upload, dll)
    client_max_body_size 10M;

    # Timeout
    proxy_read_timeout 60s;
    proxy_connect_timeout 10s;

    # ─────────────────────────────────────────────────────────────
    # BACKEND API ROUTES — semua ini diteruskan ke port 4000
    # ─────────────────────────────────────────────────────────────

    # Admin API & Auth (login, session, dll)
    location /admin/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $http_cookie;
    }

    # Tenant Auth API
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $http_cookie;
    }

    # Tenant routes (multi-tenant path-based)
    location /tenant/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $http_cookie;
    }

    # Session endpoint
    location /me {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $http_cookie;
    }

    # Health check
    location /healthz {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        access_log off;
    }

    # Legacy routes
    location /legacy/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $http_cookie;
    }

    # ─────────────────────────────────────────────────────────────
    # FRONTEND — Admin UI (port 3000)
    # ─────────────────────────────────────────────────────────────
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $http_cookie;
        # Untuk Next.js Hot Reload (development, hapus di production)
        # proxy_set_header Upgrade $http_upgrade;
        # proxy_set_header Connection "upgrade";
    }
}
```

---

## 10. SSL dengan Certbot

Jika belum ada SSL atau perlu renew:

```bash
# Stop nginx sementara (jika port 80 dipakai)
systemctl stop nginx

# Generate SSL
certbot certonly --standalone -d transity.realmio.web.id

# Start nginx kembali
systemctl start nginx

# Test konfigurasi
nginx -t

# Reload
systemctl reload nginx

# Auto-renew (cek apakah sudah ada di cron)
certbot renew --dry-run
```

---

## 11. Langkah Deploy Step-by-Step

### Langkah 1: Masuk ke direktori project

```bash
cd ~/.openclaw/workspace/realmio-transity
```

### Langkah 2: Update environment variables

```bash
# Edit .env backend
nano .env
# Pastikan PORT=4000, NODE_ENV=production, ENABLE_DEV_ENDPOINTS=false

# Edit .env.production admin-ui
nano admin-ui/.env.production
```

### Langkah 3: Update konfigurasi Next.js (PENTING)

```bash
cat > admin-ui/next.config.ts << 'EOF'
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
};

export default nextConfig;
EOF
```

### Langkah 4: Update Dockerfile admin-ui

```bash
cat > admin-ui/Dockerfile << 'EOF'
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
EOF
```

### Langkah 5: Build ulang semua container

```bash
# Stop container yang berjalan
docker-compose down

# Build ulang dari awal (tanpa cache)
docker-compose build --no-cache

# Jalankan
docker-compose up -d
```

### Langkah 6: Jalankan migrasi database

```bash
# Jalankan migrasi Prisma
docker-compose exec api npx prisma migrate deploy

# Cek status
docker-compose exec api npx prisma migrate status
```

### Langkah 7: Update Nginx config

```bash
# Backup config lama
cp /etc/nginx/conf.d/realmio.conf /etc/nginx/conf.d/realmio.conf.backup

# Buat config baru (copy-paste dari bagian Nginx di atas)
nano /etc/nginx/conf.d/realmio.conf

# Test konfigurasi
nginx -t

# Reload Nginx
systemctl reload nginx
```

### Langkah 8: Verifikasi

```bash
# Cek container berjalan
docker-compose ps

# Cek log backend
docker-compose logs -f api

# Cek log frontend
docker-compose logs -f admin-ui

# Test health check
curl -s https://transity.realmio.web.id/healthz | python3 -m json.tool

# Test login via curl
curl -v -X POST https://transity.realmio.web.id/admin/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@transity.web.id","password":"Admin123!"}'
```

---

## 12. Troubleshooting

### Problem: Login tetap gagal / 401 Unauthorized

**Cek 1**: Apakah request sampai ke backend?
```bash
# Cek log backend secara realtime, lalu coba login
docker-compose logs -f api
```

Jika tidak ada log masuk, berarti Nginx tidak meneruskan ke backend. Cek lagi Nginx config.

**Cek 2**: Apakah CORS benar?
```bash
curl -v -X OPTIONS https://transity.realmio.web.id/admin/auth/sign-in/email \
  -H "Origin: https://transity.realmio.web.id" \
  -H "Access-Control-Request-Method: POST"
```

Harus ada header `Access-Control-Allow-Origin` di response.

**Cek 3**: Apakah `TRUSTED_ORIGINS` sudah benar di `.env`?
```bash
docker-compose exec api printenv TRUSTED_ORIGINS
```

---

### Problem: Container tidak mau start

```bash
# Lihat error saat build
docker-compose logs api
docker-compose logs admin-ui

# Atau jalankan interactive untuk debug
docker-compose run --rm api sh
docker-compose run --rm admin-ui sh
```

---

### Problem: Database connection error

```bash
# Test koneksi dari dalam container
docker-compose exec api node -e "
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });
p.query('SELECT 1').then(() => console.log('DB OK')).catch(e => console.error(e));
"
```

---

### Problem: `Cannot find module 'tsx'` atau build error

```bash
# Pastikan Dockerfile menggunakan npm install (bukan --production)
# lalu rebuild
docker-compose build --no-cache api
```

---

### Problem: Cookies tidak tersimpan setelah login

Ini biasanya terjadi karena `BETTER_AUTH_URL` tidak sesuai dengan domain yang diakses.

Pastikan `.env`:
```bash
BETTER_AUTH_URL=https://transity.realmio.web.id   # Harus sama dengan domain Nginx
```

Dan di Nginx, selalu teruskan header `Cookie`:
```nginx
proxy_set_header Cookie $http_cookie;
```

---

### Problem: Next.js static export gagal build (error `<Html>` outside `_document`)

Ini terjadi jika `output: 'export'` digunakan dengan App Router. Solusinya:
1. Ganti ke `output: 'standalone'` (rekomendasi), atau
2. Hapus file `error.tsx` dari `app/`, atau
3. Gunakan Next.js versi lama yang kompatibel

---

## Ringkasan Perbedaan Setup Lama vs Baru

| Aspek | Setup Lama (Salah) | Setup Baru (Benar) |
|---|---|---|
| `/admin/*` di Nginx | Ke frontend (3000) | Ke backend (4000) |
| `/api/*` di Nginx | Strip prefix lalu ke (4000) | Teruskan ke (4000) |
| Cookie forwarding | Tidak ada | `proxy_set_header Cookie` |
| X-Forwarded-Proto | Tidak ada | Ada (penting untuk HTTPS) |
| Admin UI output | `export` (static) | `standalone` (Next.js server) |
| Admin UI CMD | `npx serve out` | `npm start` |

---

## Quick Commands Referensi

```bash
# Lihat status semua container
docker-compose ps

# Restart semua
docker-compose restart

# Restart satu service
docker-compose restart api
docker-compose restart admin-ui

# Lihat log realtime
docker-compose logs -f
docker-compose logs -f api

# Masuk ke shell container
docker-compose exec api sh
docker-compose exec admin-ui sh

# Rebuild dan deploy ulang
docker-compose down && docker-compose build --no-cache && docker-compose up -d

# Cek variabel environment di container
docker-compose exec api printenv | grep -E "PORT|AUTH|DATABASE"

# Test health
curl https://transity.realmio.web.id/healthz
```
