# Provisioning Guide

Panduan ini menjelaskan cara membuat dan memelihara aset PostgreSQL yang dibutuhkan Realmio. Proses dibagi menjadi tiga lapisan:

1. **Database setup** – Membuat database dan menjalankan Prisma migrations.
2. **Admin system** – Memastikan schema `authcore_system` sudah ada dan benar.
3. **Bootstrap data** – Membuat admin user pertama.

Semua langkah bersifat idempotent; aman untuk dijalankan ulang.

## 1. Setup Database

### 1.1 Buat Database dan Role

```bash
# Buat database
createdb authdb

# Buat role realmio (diperlukan oleh migration SQL)
psql -d authdb -c "CREATE ROLE realmio WITH LOGIN PASSWORD 'realmio';"
```

### 1.2 Jalankan Prisma Migrations

Cara yang direkomendasikan untuk setup database adalah menggunakan Prisma migrations:

```bash
# Generate Prisma client
npx prisma generate

# Jalankan semua migrations
DATABASE_URL="postgresql://user:password@localhost:5432/authdb" npx prisma migrate deploy
```

Migrations akan membuat:

**Schema `public`:**
- `users` — Better Auth users
- `accounts` — OAuth providers dan password auth
- `sessions` — Active sessions
- `verification` — Email verification tokens
- `organizations`, `member`, `invitation` — Organization management
- `apikey` — API keys
- `jwks` — JWT key pairs
- `two_factor` — 2FA secrets
- `tenants` — Tenant registry
- `applications` — Tenant applications
- `tenant_audit_log` — Audit log
- `application_sub_tenants` — Nested tenancy

**Schema `authcore_system`:**
- `users` — Admin users (terpisah dari tenant users)
- `accounts` — Admin auth accounts
- `sessions` — Admin sessions
- `verification` — Admin verification tokens
- `organizations`, `member`, `invitation` — Admin organizations
- `apikey` — Admin API keys
- `jwks` — Admin JWT key pairs
- `two_factor` — Admin 2FA
- `audit_actions` — Admin action audit log
- `admin_settings` — System settings

> **Catatan Penting:** Semua kolom di `authcore_system` menggunakan camelCase (seperti `emailVerified`, `createdAt`, `accountId`) agar kompatibel dengan Prisma client.

### 1.3 Verifikasi Database

```bash
# Cek schema yang ada
psql -d authdb -c "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name;"

# Cek tabel di authcore_system
psql -d authdb -c "\dt authcore_system.*"

# Cek tabel di public
psql -d authdb -c "\dt public.*"
```

## 2. Setup Admin System

### 2.1 Buat Admin User Pertama

Setelah server berjalan, daftarkan admin user:

```bash
# Daftarkan admin user
curl -X POST http://localhost:4000/admin/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@realmio.id","password":"Admin123!","name":"Admin"}'

# Set role menjadi admin
psql -d authdb -c "UPDATE authcore_system.users SET role = 'admin' WHERE email = 'admin@realmio.id';"
```

### 2.2 Verifikasi Admin User

```bash
# Cek admin user
psql -d authdb -c "SELECT id, email, role FROM authcore_system.users;"

# Test login
curl -c admin-cookie.txt -b admin-cookie.txt \
  -X POST http://localhost:4000/admin/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@realmio.id","password":"Admin123!"}'
```

## 3. Membuat Tenant

### 3.1 Via Admin API

Setelah login sebagai admin:

```bash
# Login admin
curl -c admin-cookie.txt -b admin-cookie.txt \
  -X POST http://localhost:4000/admin/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@realmio.id","password":"Admin123!"}'

# Buat tenant baru
curl -c admin-cookie.txt -b admin-cookie.txt \
  -X POST http://localhost:4000/admin/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-app",
    "name": "My Application",
    "slug": "my-app"
  }'
```

### 3.2 Via Admin Dashboard

1. Buka `http://localhost:3001/login`
2. Login dengan kredensial admin
3. Navigasi ke menu **Tenants**
4. Klik **Create Tenant**
5. Isi form dan submit

### 3.3 Verifikasi Tenant

```bash
# List semua tenant
curl -c admin-cookie.txt -b admin-cookie.txt \
  http://localhost:4000/admin/api/tenants

# Cek di database
psql -d authdb -c "SELECT id, slug, schema_name, status FROM public.tenants;"
```

## 4. Mode Operasi

### Single-Tenant (`AUTH_MODE=single`)

```bash
# .env
AUTH_MODE=single
TENANT_ID=my-tenant
TENANT_SCHEMA=public
```

Tidak perlu membuat tenant via API. Server langsung menggunakan schema yang ditentukan.

### Multi-Tenant (`AUTH_MODE=multi`)

```bash
# .env
AUTH_MODE=multi
NESTED_TENANCY_ENABLED=false
```

Tenant dibuat via Admin API atau dashboard. Setiap tenant mendapat schema PostgreSQL tersendiri.

### Hybrid/Nested (`AUTH_MODE=multi`, `NESTED_TENANCY_ENABLED=true`)

```bash
# .env
AUTH_MODE=multi
NESTED_TENANCY_ENABLED=true
```

Mendukung sub-tenant dalam tenant. Gunakan untuk struktur hierarki seperti perusahaan → departemen.

## 5. Provisioning Tenant Schema

Ketika tenant dibuat via API, Realmio otomatis membuat schema PostgreSQL untuk tenant tersebut. Schema berisi tabel-tabel Better Auth yang terisolasi:

- `user` — Tenant users
- `session` — Tenant sessions
- `account` — Tenant auth accounts
- `verification` — Tenant verification tokens
- `organization`, `member`, `invitation` — Tenant organizations
- `apikey` — Tenant API keys
- `jwks` — Tenant JWT key pairs
- `two_factor` — Tenant 2FA

Untuk melihat schema tenant:

```bash
# Ganti 'tenant_my-app' dengan nama schema tenant Anda
psql -d authdb -c "\dt tenant_my-app.*"
```

## 6. Backup & Restore

```bash
# Backup seluruh database
pg_dump authdb > authdb_backup.sql

# Backup hanya authcore_system
pg_dump -n authcore_system authdb > authcore_system_backup.sql

# Restore
psql authdb < authdb_backup.sql
```

## 7. Reset Database (Development)

```bash
# Hapus dan buat ulang database
dropdb authdb
createdb authdb
psql -d authdb -c "CREATE ROLE realmio WITH LOGIN PASSWORD 'realmio';"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/authdb" npx prisma migrate deploy
```
