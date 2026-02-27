# Realmio

Realmio adalah layanan autentikasi headless multi-tenant berbasis **Fastify + Better Auth** yang mendukung:

- 🔐 Cookie session, Bearer token, API key, JWT
- 🏢 Multi-tenant dengan isolasi schema PostgreSQL
- 👥 Organizations & role-based access control
- 🔑 Two-Factor Authentication (TOTP)
- 🔒 Security headers, IP blocking, rate limiting
- 📊 Admin dashboard untuk manajemen tenant
- 🔔 Webhook notifications

## 🚀 Quick Start

```bash
# 1. Clone & install
git clone https://github.com/Rndynt/Realmio.git realmio
cd realmio && npm install

# 2. Setup database
createdb authdb
psql -d authdb -c "CREATE ROLE realmio WITH LOGIN PASSWORD 'realmio';"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/authdb" npx prisma migrate deploy

# 3. Konfigurasi .env
cp .env.example .env
# Edit .env: set DATABASE_URL, BETTER_AUTH_SECRET (min 24 chars), PORT=4000

# 4. Jalankan server
npm run dev

# 5. Buat admin user
curl -X POST http://localhost:4000/admin/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@realmio.id","password":"Admin123!","name":"Admin"}'
psql -d authdb -c "UPDATE authcore_system.users SET role = 'admin' WHERE email = 'admin@realmio.id';"

# 6. Jalankan Admin UI
cd admin-ui && NEXT_PUBLIC_API_URL=http://localhost:4000 npm run dev
```

Buka **http://localhost:3001/login** dan login dengan `admin@realmio.id` / `Admin123!`

## 🧭 Tenant Identification

Untuk mode multi-tenant, Realmio mengenali tenant melalui:
- Header `X-Tenant-Id: {tenant-slug}`
- Subdomain (misalnya `pos.your-auth-domain.com`)

## 📡 API Endpoints Utama

| Endpoint | Deskripsi |
|----------|-----------|
| `GET /healthz` | Health check |
| `POST /admin/auth/sign-up/email` | Daftar admin |
| `POST /admin/auth/sign-in/email` | Login admin |
| `GET /admin/api/tenants` | List tenants (auth required) |
| `POST /admin/api/tenants` | Buat tenant baru (auth required) |
| `POST /api/auth/sign-up/email` | Daftar user tenant |
| `POST /api/auth/sign-in/email` | Login user tenant |
| `GET /api/auth/get-session` | Check session |
| `GET /tenant/:id/health` | Health check per tenant |

## 📚 Dokumentasi

| Dokumen | Deskripsi |
|---------|-----------|
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | Panduan instalasi lengkap |
| [docs/QUICK_START.md](docs/QUICK_START.md) | Quick start guide |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Konfigurasi environment variables |
| [docs/PROVISIONING.md](docs/PROVISIONING.md) | Setup database dan tenant |
| [docs/TESTING.md](docs/TESTING.md) | Panduan testing |
| [docs/FEATURES.md](docs/FEATURES.md) | Daftar fitur |
| [docs/INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md) | Integrasi ke aplikasi |
| [docs/DEPLOYMENT.md](DEPLOYMENT.md) | Deployment ke production |
| [docs/changelog/IMPROVEMENTS_2026.md](docs/changelog/IMPROVEMENTS_2026.md) | Changelog terbaru |

## 🏗️ Arsitektur

```
┌─────────────────────────────────────────────────────┐
│                   Realmio Server                     │
│                  (Fastify, port 4000)                │
├─────────────────┬───────────────────────────────────┤
│   Admin Routes  │         Tenant Routes              │
│  /admin/auth/*  │      /api/auth/* (per tenant)      │
│  /admin/api/*   │      X-Tenant-Id header            │
├─────────────────┴───────────────────────────────────┤
│                  PostgreSQL Database                  │
├──────────────┬──────────────┬───────────────────────┤
│ authcore_    │   public.*   │  tenant_{slug}.*       │
│ system.*     │  (registry)  │  (per-tenant schema)   │
│ (admin auth) │              │                        │
└──────────────┴──────────────┴───────────────────────┘
```

## 🔧 Tech Stack

- **Runtime:** Node.js 20 LTS
- **Framework:** Fastify 5
- **Auth:** Better Auth 1.x
- **ORM:** Prisma 6
- **Database:** PostgreSQL 14+
- **Admin UI:** Next.js 15 + Tailwind CSS
- **Language:** TypeScript

## 📄 License

MIT
