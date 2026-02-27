# ⚡ Quick Start Guide

Panduan cepat untuk mulai menggunakan Realmio dalam 10 menit.

## 🚀 Setup Lokal (Development)

### 1. Clone & Install

```bash
git clone https://github.com/Rndynt/Realmio.git realmio
cd realmio
npm install
```

### 2. Setup Database

```bash
# Buat database PostgreSQL
createdb authdb
psql -d authdb -c "CREATE ROLE realmio WITH LOGIN PASSWORD 'realmio';"

# Jalankan migrations
npx prisma generate
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/authdb" npx prisma migrate deploy
```

### 3. Konfigurasi .env

```bash
cp .env.example .env
```

Edit `.env`:
```bash
PORT=4000
BETTER_AUTH_URL=http://localhost:4000
BETTER_AUTH_SECRET=your-secret-key-minimum-24-characters-long
TRUSTED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/authdb
AUTH_MODE=multi
```

### 4. Jalankan Server

```bash
# Terminal 1: Backend API
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/authdb" \
BETTER_AUTH_SECRET="your-secret-key-minimum-24-characters-long" \
npm run dev

# Terminal 2: Admin UI
cd admin-ui
NEXT_PUBLIC_API_URL=http://localhost:4000 npm run dev
```

### 5. Buat Admin User

```bash
# Daftarkan admin
curl -X POST http://localhost:4000/admin/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@realmio.id","password":"Admin123!","name":"Admin"}'

# Set role admin
psql -d authdb -c "UPDATE authcore_system.users SET role = 'admin' WHERE email = 'admin@realmio.id';"
```

### 6. Akses Dashboard

Buka browser: **http://localhost:3001/login**

Login dengan:
- Email: `admin@realmio.id`
- Password: `Admin123!`

---

## 🎯 Test API via curl

### Admin Login
```bash
curl -c admin-cookie.txt -b admin-cookie.txt \
  -X POST http://localhost:4000/admin/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@realmio.id","password":"Admin123!"}'
```

### List Tenants
```bash
curl -c admin-cookie.txt -b admin-cookie.txt \
  http://localhost:4000/admin/api/tenants
```

### Buat Tenant Baru
```bash
curl -c admin-cookie.txt -b admin-cookie.txt \
  -X POST http://localhost:4000/admin/api/tenants \
  -H "Content-Type: application/json" \
  -d '{"id":"my-app","name":"My Application","slug":"my-app"}'
```

### Register User Tenant
```bash
curl -X POST http://localhost:4000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: my-app" \
  -d '{"email":"user@example.com","password":"Passw0rd!","name":"User"}'
```

### Login User Tenant
```bash
curl -c tenant-cookie.txt -b tenant-cookie.txt \
  -X POST http://localhost:4000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: my-app" \
  -d '{"email":"user@example.com","password":"Passw0rd!"}'
```

### Check Session
```bash
curl -c tenant-cookie.txt -b tenant-cookie.txt \
  -H "X-Tenant-Id: my-app" \
  http://localhost:4000/api/auth/get-session
```

### Health Check
```bash
curl http://localhost:4000/healthz
```

---

## 🔑 Authentication Methods

| Method | Use Case | Cara Penggunaan |
|--------|----------|-----------------|
| **Cookie** | Web apps (same domain) | Browser auto-sends cookie |
| **Bearer Token** | Mobile apps, SPAs | `Authorization: Bearer {token}` |
| **API Key** | Backend services | `x-api-key: {key}` |
| **JWT** | Microservices | Verify dengan JWKS endpoint |

---

## 🚀 Integrasi ke Aplikasi

### React / Next.js

```jsx
// Contoh login
async function login(email, password) {
  const res = await fetch('http://localhost:4000/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': 'my-app'  // tenant ID Anda
    },
    credentials: 'include',  // untuk cookie
    body: JSON.stringify({ email, password })
  });
  return res.json();
}

// Contoh check session
async function getSession() {
  const res = await fetch('http://localhost:4000/api/auth/get-session', {
    headers: { 'X-Tenant-Id': 'my-app' },
    credentials: 'include'
  });
  return res.json();
}
```

### Node.js Backend

```javascript
// Middleware autentikasi
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const tenantId = req.headers['x-tenant-id'];
  
  try {
    const response = await fetch('http://localhost:4000/api/auth/get-session', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Tenant-Id': tenantId
      }
    });
    
    if (!response.ok) throw new Error('Unauthorized');
    
    const { user } = await response.json();
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
```

---

## 📚 Dokumentasi Lengkap

- **Installation:** `docs/INSTALLATION.md`
- **Configuration:** `docs/CONFIGURATION.md`
- **Provisioning:** `docs/PROVISIONING.md`
- **Testing:** `docs/TESTING.md`
- **Integration Guide:** `docs/INTEGRATION_GUIDE.md`
- **Features:** `docs/FEATURES.md`

---

## 🆘 Troubleshooting

### CORS Error
**Problem:** Browser blocks request dengan CORS error  
**Solusi:** Tambahkan domain Anda ke `TRUSTED_ORIGINS` di `.env`

### 401 Unauthorized
**Problem:** Session token invalid atau expired  
**Solusi:** Login ulang untuk mendapatkan session baru

### 403 Tenant Required
**Problem:** Request tanpa `X-Tenant-Id` header  
**Solusi:** Tambahkan header `X-Tenant-Id: {tenant-slug}` ke setiap request

### 500 Internal Server Error
**Problem:** Server error  
**Solusi:** Check log server: `tail -f /tmp/server.log`
