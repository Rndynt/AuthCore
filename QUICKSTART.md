# Quick Start Guide - Auth Service Setup

Dokumentasi lengkap untuk setup aplikasi Auth Service dari awal setelah clone repository.

## 📋 Prerequisites

- Node.js v20+ (sudah terinstall di Replit)
- npm atau pnpm
- PostgreSQL database (di Replit, gunakan built-in database)
- Git

## 🚀 Step 1: Install Dependencies

Setelah clone repo, jalankan:

```bash
npm install
```

Ini akan install semua packages yang diperlukan (~1552 packages).

**Output yang diharapkan:**
```
added 1552 packages, and audited 1554 packages in 56s
```

## 🗄️ Step 2: Setup Database

### 2.1 Buat PostgreSQL Database (Replit)

Di Replit, gunakan built-in database:
- Buka "Database" tab di kanan
- Click "Create Database"
- Database akan otomatis tersedia dengan env variables:
  - `DATABASE_URL`
  - `PGHOST`
  - `PGPORT`
  - `PGUSER`
  - `PGPASSWORD`
  - `PGDATABASE`

### 2.2 Sync Prisma Schema ke Database

Prisma schema sudah lengkap dengan semua auth tables. Sync ke database:

```bash
npx prisma db push --force-reset
```

**Output yang diharapkan:**
```
The PostgreSQL database was successfully reset.
🚀 Your database is now in sync with your Prisma schema. Done in 320ms
✔ Generated Prisma Client (v6.19.0)
```

## 📊 Step 3: Setup Multi-Tenant Infrastructure

### 3.1 Setup Admin System Schema

Jalankan SQL script untuk membuat schema `authcore_system` untuk admin:

```bash
psql -h $PGHOST -U $PGUSER -d $PGDATABASE -f scripts/setup-admin-schema.sql
```

**Output yang diharapkan:**
```
CREATE SCHEMA
CREATE TABLE
... (12 tables)
authcore_system schema setup completed successfully!
```

**Apa yang dibuat:**
- Schema: `authcore_system` (isolated admin system)
- 12 tables untuk admin authentication
- Audit log table untuk tracking admin actions

### 3.2 Create Public Schema Tables

Jalankan multi-tenant setup SQL:

```bash
psql -h $PGHOST -U $PGUSER -d $PGDATABASE -f src/multi-tenant/schema.sql
```

**Output yang diharapkan:**
```
CREATE TABLE
CREATE INDEX
CREATE TRIGGER
... setup completed
```

**Apa yang dibuat:**
- `tenants` table - registry semua tenant
- `applications` table - apps yang consume auth service
- `tenant_audit_log` table - audit trail
- Sample data: 3 tenants (pos, ticket, crypto)

### 3.3 Provision Tenant Schemas

Buat isolated schema untuk setiap tenant dan clone auth tables:

```bash
npx tsx src/multi-tenant/provision-schemas.ts
```

**Output yang diharapkan:**
```
🚀 Starting tenant schema provisioning...

📁 Provisioning schema for: Crypto Exchange (tenant_crypto)
   ✅ Schema created: tenant_crypto
   ✅ Table cloned: tenant_crypto.users
   ✅ Table cloned: tenant_crypto.accounts
   ✅ Table cloned: tenant_crypto.sessions
   ... (12 tables total)
   ✅ Tenant schema provisioned successfully

📁 Provisioning schema for: POS Kasir (tenant_pos)
   ✅ Schema created: tenant_pos
   ... (12 tables)

📁 Provisioning schema for: Ticketing System (tenant_ticket)
   ✅ Schema created: tenant_ticket
   ... (12 tables)

✅ All tenant schemas provisioned successfully!
```

**Apa yang terjadi:**
- 3 schemas dibuat: `tenant_pos`, `tenant_ticket`, `tenant_crypto`
- Setiap schema mendapat 12 auth tables yang identik
- Tables yang di-clone: users, accounts, sessions, organizations, dll
- Data setiap tenant terisolasi sempurna

## 📊 Database Structure Setelah Setup

```
Public Schema (Shared)
├── tenants (3 records: pos, ticket, crypto)
├── applications (3 records per tenant)
├── tenant_audit_log
└── 12 auth tables dari Prisma

authcore_system Schema (Admin)
├── users (admin users)
├── accounts
├── sessions
└── 10 other auth tables
└── audit_actions (track admin actions)

tenant_pos Schema (Isolated)
├── users
├── accounts
├── sessions
└── 10 other auth tables

tenant_ticket Schema (Isolated)
├── users
├── accounts
├── sessions
└── 10 other auth tables

tenant_crypto Schema (Isolated)
├── users
├── accounts
├── sessions
└── 10 other auth tables
```

## ▶️ Step 4: Start Application Server

```bash
npm run dev
```

**Output yang diharapkan:**
```
🔧 AuthCore Configuration:
   Mode: MULTI
   Nested Tenancy: DISABLED
🎯 Active Features:
   Tenant Registry: ✅
   Nested Tenancy: ❌
   Tenant Middleware: ✅
   Dev Endpoints: ❌
   Audit Log: ✅

✅ Loaded 3 tenants into registry
  📁 pos: POS Kasir (tenant_pos) [active]
  📁 ticket: Ticketing System (tenant_ticket) [active]
  📁 crypto: Crypto Exchange (tenant_crypto) [active]

✅ Multi-tenant manager initialized
✅ Admin routes registered
✅ Admin UI available at http://0.0.0.0:5000

[02:11:03.476] INFO: Auth service running on port 5000
```

Server akan running di `http://localhost:5000`

## 👤 Step 5: Create Admin User

Buat user admin untuk login ke Admin UI:

```bash
curl -X POST http://localhost:5000/admin/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin123!",
    "name": "Admin User"
  }'
```

**Response yang diharapkan:**
```json
{
  "token": "HikgY4nZHNnkPC6MrMkmWAX8vOFeKZlo",
  "user": {
    "name": "Admin User",
    "email": "admin@example.com",
    "emailVerified": false,
    "createdAt": "2025-12-22T02:11:21.935Z",
    "id": "3cBfZANcFHRCNLXq9qyuSnQMFb7wNAhv"
  }
}
```

## 🧪 Step 6: Test Admin Login

Login dengan user yang baru dibuat:

```bash
curl -X POST http://localhost:5000/admin/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin123!"
  }'
```

**Response yang diharapkan:**
```json
{
  "redirect": false,
  "token": "5uYbFiE8sfroyNUzJxrckIwWjzDI5hS4",
  "user": {
    "name": "Admin User",
    "email": "admin@example.com",
    ...
  }
}
```

Sekarang bisa akses Admin UI di browser.

## 👥 Step 7: Create Tenant Users (Optional)

Untuk test per-tenant, create user untuk tenant tertentu dengan header `X-Tenant-Id`:

```bash
curl -X POST http://localhost:5000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: pos" \
  -d '{
    "email": "pos-user@example.com",
    "password": "User1234!",
    "name": "POS User"
  }'
```

Atau gunakan subdomain:
```bash
curl -X POST http://pos.localhost:5000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "pos-user@example.com",
    "password": "User1234!",
    "name": "POS User"
  }'
```

## ✅ Verification Checklist

Setelah semua steps selesai, verify dengan checklist ini:

- [ ] npm install selesai
- [ ] Prisma schema synced: `npx prisma db push --force-reset`
- [ ] Admin schema created: `scripts/setup-admin-schema.sql`
- [ ] Public schema tables created: `src/multi-tenant/schema.sql`
- [ ] Tenant schemas provisioned: `npx tsx src/multi-tenant/provision-schemas.ts`
- [ ] Server running: `npm run dev`
- [ ] Admin user created (step 5)
- [ ] Admin login tested (step 6)
- [ ] Database schemas accessible:
  ```bash
  psql -h $PGHOST -U $PGUSER -d $PGDATABASE -c "\dn"
  # Should show: public, authcore_system, tenant_pos, tenant_ticket, tenant_crypto
  ```

## 🔗 Available Endpoints

### Admin API
- `POST /admin/auth/sign-up/email` - Register admin
- `POST /admin/auth/sign-in/email` - Login admin
- `GET /admin/auth/get-session` - Get admin session
- `GET /admin/api/overview` - Get admin dashboard data

### Tenant API
- `POST /api/auth/sign-up/email` - Register tenant user (requires X-Tenant-Id)
- `POST /api/auth/sign-in/email` - Login tenant user
- `GET /api/auth/get-session` - Get tenant session

### UI
- `http://localhost:5000/` - Admin Dashboard
- `http://localhost:5000/login` - Admin Login Page
- `http://localhost:5000/tenants` - Manage Tenants (admin)
- `http://localhost:5000/users` - Manage Users (admin)
- `http://localhost:5000/security` - Security Settings (admin)
- `http://localhost:5000/audit` - Audit Logs (admin)

## 📚 Project Structure

```
├── src/
│   ├── server.ts                    # Main Fastify server
│   ├── admin/                       # Admin dashboard & API
│   │   ├── admin-api.ts
│   │   ├── routes.ts
│   │   └── ...
│   ├── multi-tenant/
│   │   ├── connection-manager.ts    # Multi-tenant logic
│   │   ├── provision-schemas.ts     # Schema provisioning script
│   │   └── schema.sql               # Multi-tenant DDL
│   └── routes/                      # Auth routes
├── admin-ui/                        # Next.js admin dashboard (compiled)
├── prisma/
│   ├── schema.prisma                # Prisma data model
│   └── migrations/                  # Prisma migrations
├── scripts/
│   └── setup-admin-schema.sql       # Admin schema setup
├── shared/
│   └── schema.ts                    # Drizzle schema definitions
├── package.json
└── tsconfig.json
```

## 🐛 Troubleshooting

### Error: "relation public.tenants does not exist"
**Solusi:** Jalankan setup scripts di step 3.2 dan 3.3

### Error: "TENANT_REQUIRED"
**Solusi:** Kirim request dengan header `X-Tenant-Id: pos` atau gunakan subdomain

### Error: "UNAUTHORIZED" pada admin endpoints
**Solusi:** Buat admin user dulu (step 5), terus login (step 6)

### Database migration error
**Solusi:** 
```bash
# Reset dan sync ulang
npx prisma db push --force-reset
# Terus jalankan setup scripts lagi
```

### Server doesn't start
**Solusi:**
```bash
# Check connection string
echo $DATABASE_URL

# Check Node version
node --version  # should be v20+

# Clear cache dan reinstall
rm -rf node_modules
npm install
```

## 📖 Additional Resources

- [Better Auth Docs](https://www.better-auth.com/)
- [Prisma Docs](https://www.prisma.io/docs/)
- [Fastify Docs](https://www.fastify.io/)
- Project docs: Check `MULTI_TENANT_IMPLEMENTATION.md` dan `DEPLOYMENT.md`

## 🎯 Next Steps

Setelah setup selesai:

1. **Customize Branding** - Edit admin-ui components
2. **Add Features** - Extend auth routes & tenant management
3. **Configure Email** - Setup email verification & password reset
4. **Production Deployment** - Check DEPLOYMENT.md
5. **Performance Tuning** - Add caching, indexes, etc.

---

**Last Updated:** December 22, 2025
**Version:** 1.0
