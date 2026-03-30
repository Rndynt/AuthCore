# Installation Guide

Panduan ini menjelaskan cara menjalankan Realmio dari awal hingga siap digunakan. Di akhir panduan, Anda akan memiliki instance lokal yang merespons permintaan autentikasi tenant dan admin.

## 1. Prerequisites

| Dependency | Version | Notes |
|------------|---------|-------|
| Node.js | 18.x atau 20.x LTS | Diperlukan untuk Fastify server dan tooling. |
| npm | 9+ | Digunakan oleh project scripts. |
| PostgreSQL | 14+ | Realmio menggunakan PostgreSQL schemas untuk isolasi data. |

Pastikan PostgreSQL dapat diakses dari mesin development Anda dan Anda memiliki database yang siap untuk Realmio.

## 2. Clone & Install

```bash
# Clone repository
git clone https://github.com/Rndynt/Realmio.git realmio
cd realmio

# Install dependencies backend
npm install

# Install dependencies admin UI
cd admin-ui && npm install && cd ..
```

## 3. Konfigurasi Environment

Realmio membaca semua konfigurasi dari file `.env` di root project. Buat file `.env` dari template:

```bash
cp .env.example .env
```

Edit `.env` sesuai environment Anda:

```bash
# Server
PORT=4000
BETTER_AUTH_URL=http://localhost:4000
BETTER_AUTH_SECRET=your-secret-key-minimum-24-characters-long

# CORS / Trusted Origins (pisahkan dengan koma)
TRUSTED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:4000

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/authdb

# Mode operasi
AUTH_MODE=multi                    # 'single' atau 'multi'
NESTED_TENANCY_ENABLED=false       # true untuk nested tenancy

# Untuk AUTH_MODE=single saja:
# TENANT_ID=my-tenant
# TENANT_SCHEMA=public

# Optional
ENABLE_DEV_ENDPOINTS=false
```

> **Penting:** `BETTER_AUTH_SECRET` harus minimal 24 karakter. Generate dengan:
> ```bash
> openssl rand -base64 32
> ```

## 4. Setup Database

### 4.1 Buat Database

```bash
# Buat database
createdb authdb

# Buat role realmio (diperlukan oleh migration)
psql -d authdb -c "CREATE ROLE realmio WITH LOGIN PASSWORD 'realmio';"
```

### 4.2 Jalankan Prisma Migrations

```bash
# Generate Prisma client
npx prisma generate

# Jalankan semua migrations
npx prisma migrate deploy
```

Migrations akan membuat:
- Tabel-tabel Better Auth di schema `public` (users, accounts, sessions, dll.)
- Schema `authcore_system` untuk admin dashboard dengan kolom-kolom yang kompatibel dengan Prisma
- Tabel `tenants`, `applications`, `tenant_audit_log` di schema `public`
- Tabel `two_factor` untuk 2FA support

### 4.3 Buat Admin User

Setelah migrations berhasil, buat admin user pertama:

```bash
# Daftarkan admin user via API (server harus sudah berjalan)
curl -X POST http://localhost:4000/admin/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@realmio.id","password":"Admin123!","name":"Admin"}'

# Update role menjadi admin di database
psql -d authdb -c "UPDATE authcore_system.users SET role = 'admin' WHERE email = 'admin@realmio.id';"
```

> **Catatan:** Ganti password default setelah login pertama.

## 5. Jalankan Server

### Backend API (port 4000)

```bash
npm run dev
```

Server Fastify akan berjalan di `http://localhost:4000`.

### Admin UI (port 3001)

```bash
cd admin-ui
NEXT_PUBLIC_API_URL=http://localhost:4000 npm run dev
```

Admin UI akan berjalan di `http://localhost:3001`.

### Script Startup Otomatis

Gunakan script `start-local.sh` untuk menjalankan semua sekaligus:

```bash
chmod +x start-local.sh
bash start-local.sh
```

## 6. Verifikasi

Setelah server berjalan, verifikasi dengan:

```bash
# Health check backend
curl http://localhost:4000/healthz

# Akses admin UI
open http://localhost:3001/login
```

**Kredensial Admin:**
- Email: `admin@realmio.id`
- Password: `Admin123!`

Lihat [TESTING.md](./TESTING.md) untuk panduan testing lengkap.

## 7. Troubleshooting

### Error: BETTER_AUTH_SECRET too short
```
Environment validation failed:
  - BETTER_AUTH_SECRET: String must contain at least 24 character(s)
```
**Solusi:** Set `BETTER_AUTH_SECRET` dengan nilai minimal 24 karakter di `.env`.

### Error: database "authdb" does not exist
**Solusi:** Buat database terlebih dahulu:
```bash
createdb authdb
```

### Error: role "realmio" does not exist
**Solusi:** Buat role realmio:
```bash
psql -d authdb -c "CREATE ROLE realmio WITH LOGIN PASSWORD 'realmio';"
```

### Error: Can't reach database server
**Solusi:** Pastikan PostgreSQL berjalan:
```bash
# Linux
pg_ctlcluster 14 main start
# atau
service postgresql start
```

### Admin login gagal (500 error)
**Solusi:** Pastikan schema `authcore_system` sudah dibuat oleh migration:
```bash
psql -d authdb -c "\dt authcore_system.*"
```
Jika kosong, jalankan ulang migration:
```bash
npx prisma migrate deploy
```
