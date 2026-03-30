# Testing Guide

Panduan ini untuk memverifikasi bahwa Realmio dikonfigurasi dengan benar setelah instalasi dan provisioning.

> **Prerequisites**
>
> - Server backend berjalan di `http://localhost:4000` (`npm run dev`)
> - Admin UI berjalan di `http://localhost:3001` (opsional)
> - `DATABASE_URL` mengarah ke database yang sudah di-provision
> - Admin user sudah dibuat (lihat [INSTALLATION.md](./INSTALLATION.md))
> - `curl` terinstall

## 1. Health Check

```bash
curl http://localhost:4000/healthz
```

Expected response:
```json
{
  "ok": true,
  "mode": "multi",
  "timestamp": "2026-02-27T...",
  "features": {
    "tenantRegistry": true,
    "nestedTenancy": false
  },
  "connections": {
    "healthy": true,
    "issues": [],
    "metrics": {
      "activeConnections": 0,
      "maxConnections": 50,
      "utilizationPercent": 0
    }
  }
}
```

## 2. Admin Authentication

### 2.1 Sign Up Admin (Pertama Kali)

```bash
curl -X POST http://localhost:4000/admin/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@realmio.id","password":"Admin123!","name":"Admin"}'
```

Expected: HTTP `200` dengan user object.

Setelah sign-up, set role admin:
```bash
psql -d authdb -c "UPDATE authcore_system.users SET role = 'admin' WHERE email = 'admin@realmio.id';"
```

### 2.2 Sign In Admin

```bash
curl -i \
  -c admin-cookie.txt \
  -b admin-cookie.txt \
  -X POST http://localhost:4000/admin/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@realmio.id","password":"Admin123!"}'
```

Expected:
- HTTP `200`
- Header `Set-Cookie: authcore_admin_session=...`
- Response body berisi user object dengan `role: "admin"`

### 2.3 Verifikasi Session Admin

```bash
curl -i \
  -c admin-cookie.txt \
  -b admin-cookie.txt \
  http://localhost:4000/admin/auth/get-session
```

Expected: JSON dengan `session` dan `user` objects.

### 2.4 Admin APIs

```bash
# List tenants
curl -s \
  -c admin-cookie.txt \
  -b admin-cookie.txt \
  http://localhost:4000/admin/api/tenants

# List users
curl -s \
  -c admin-cookie.txt \
  -b admin-cookie.txt \
  http://localhost:4000/admin/api/users
```

Expected: `{"tenants":[]}` (kosong jika belum ada tenant).

## 3. Tenant Authentication (Multi Mode)

### 3.1 Buat Tenant Dulu

```bash
curl -s \
  -c admin-cookie.txt \
  -b admin-cookie.txt \
  -X POST http://localhost:4000/admin/api/tenants \
  -H "Content-Type: application/json" \
  -d '{"id":"test-app","name":"Test Application","slug":"test-app"}'
```

### 3.2 Register User Tenant

```bash
curl -i \
  -c tenant-cookie.txt \
  -b tenant-cookie.txt \
  -X POST http://localhost:4000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: test-app" \
  -d '{"email":"user@example.com","password":"Passw0rd!","name":"Test User"}'
```

Expected: HTTP `200` dengan user object.

### 3.3 Login User Tenant

```bash
curl -i \
  -c tenant-cookie.txt \
  -b tenant-cookie.txt \
  -X POST http://localhost:4000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: test-app" \
  -d '{"email":"user@example.com","password":"Passw0rd!"}'
```

Expected: HTTP `200` dengan session token.

### 3.4 Check Session Tenant

```bash
curl -s \
  -c tenant-cookie.txt \
  -b tenant-cookie.txt \
  -H "X-Tenant-Id: test-app" \
  http://localhost:4000/api/auth/get-session
```

Expected: JSON dengan `session` dan `user` objects.

### 3.5 Request Tanpa Tenant Header

```bash
curl -s http://localhost:4000/api/auth/get-session
```

Expected: HTTP `400` atau `401` dengan error `tenant_required`.

## 4. Tenant Authentication (Single Mode)

Jalankan bagian ini hanya jika `AUTH_MODE=single`.

```bash
# Sign up
curl -i \
  -c tenant-cookie.txt \
  -b tenant-cookie.txt \
  -X POST http://localhost:4000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Passw0rd!","name":"User"}'

# Sign in
curl -i \
  -c tenant-cookie.txt \
  -b tenant-cookie.txt \
  -X POST http://localhost:4000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Passw0rd!"}'

# Session check
curl -s \
  -c tenant-cookie.txt \
  -b tenant-cookie.txt \
  http://localhost:4000/api/auth/get-session
```

## 5. Isolasi Data

Verifikasi bahwa data tersimpan di schema yang benar:

```bash
# Admin users (harus ada di authcore_system)
psql -d authdb -c "SELECT COUNT(*) FROM authcore_system.users;"

# Tenant users (harus ada di schema tenant)
psql -d authdb -c "SELECT COUNT(*) FROM tenant_test-app.user;"

# Tenant registry
psql -d authdb -c "SELECT id, slug, schema_name, status FROM public.tenants;"
```

## 6. Security Headers

```bash
curl -I http://localhost:4000/healthz
```

Expected headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Request-Id: <uuid>`

## 7. Rate Limiting

```bash
# Test rate limit (kirim banyak request cepat)
for i in {1..15}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:4000/api/auth/sign-in/email \
    -H "Content-Type: application/json" \
    -H "X-Tenant-Id: test-app" \
    -d '{"email":"wrong@example.com","password":"wrong"}'
done
```

Expected: Setelah beberapa request, mendapat HTTP `429 Too Many Requests`.

## 8. Per-Tenant Health Check

```bash
curl http://localhost:4000/tenant/test-app/health
```

Expected:
```json
{
  "ok": true,
  "tenantId": "test-app",
  "name": "Test Application",
  "status": "active",
  "schemaValid": true,
  "hasActiveConnection": false
}
```

## 9. Admin Dashboard (UI)

1. Buka `http://localhost:3001/login`
2. Login dengan `admin@realmio.id` / `Admin123!`
3. Verifikasi dashboard menampilkan:
   - Daftar tenants
   - Monitoring metrics
   - Audit log
   - Security settings

## 10. Checklist Verifikasi

- [ ] `GET /healthz` → `{"ok":true}`
- [ ] Admin sign-up berhasil
- [ ] Admin sign-in berhasil (HTTP 200)
- [ ] Admin session valid
- [ ] Admin API `/admin/api/tenants` accessible
- [ ] Tenant bisa dibuat via admin API
- [ ] Tenant user bisa register
- [ ] Tenant user bisa login
- [ ] Session tenant valid
- [ ] Data terisolasi per schema
- [ ] Security headers ada
- [ ] Admin UI accessible di port 3001
