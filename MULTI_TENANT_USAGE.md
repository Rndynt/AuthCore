# Multi-Tenant Auth Service - Usage Guide

## Overview

Auth service ini sudah di-implement dengan **Pattern 2: Separate Schemas** untuk true database isolation antar tenant.

## Tenants yang Sudah Provisioned

| Tenant ID | Name | Schema | Status |
|-----------|------|--------|--------|
| `pos` | POS Kasir | `tenant_pos` | Active |
| `ticket` | Ticketing System | `tenant_ticket` | Active |
| `crypto` | Crypto Exchange | `tenant_crypto` | Active |

## Cara Menggunakan

### 1. Authentication Request (Sign Up / Sign In)

Semua request ke auth endpoints **WAJIB** menyertakan `X-Tenant-Id` header:

```bash
# Sign up di POS tenant
curl -X POST https://your-auth-service.com/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: pos" \
  -d '{
    "email": "kasir@pos.com",
    "password": "SecurePassword123!",
    "name": "POS Kasir"
  }'

# Sign up di Ticketing tenant
curl -X POST https://your-auth-service.com/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: ticket" \
  -d '{
    "email": "admin@ticket.com",
    "password": "SecurePassword123!",
    "name": "Ticket Admin"
  }'
```

### 2. Tenant Identification Methods

Ada 3 cara untuk identify tenant:

#### A. Via Header (Recommended)
```bash
-H "X-Tenant-Id: pos"
```

#### B. Via Subdomain
```
https://pos.your-auth-service.com/api/auth/...
https://ticket.your-auth-service.com/api/auth/...
```

#### C. Via Path
```
/tenant/pos/api/auth/...
/tenant/ticket/api/auth/...
```

### 3. Integration dari Aplikasi Anda

#### JavaScript/TypeScript
```typescript
// POS Kasir Application
const authService = {
  baseUrl: 'https://your-auth-service.com',
  tenantId: 'pos',

  async signup(email: string, password: string, name: string) {
    const response = await fetch(`${this.baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': this.tenantId
      },
      body: JSON.stringify({ email, password, name })
    });
    return response.json();
  },

  async signin(email: string, password: string) {
    const response = await fetch(`${this.baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': this.tenantId
      },
      body: JSON.stringify({ email, password }),
      credentials: 'include' // Important for cookies
    });
    return response.json();
  }
};
```

#### Python
```python
import requests

class AuthService:
    def __init__(self, tenant_id='pos'):
        self.base_url = 'https://your-auth-service.com'
        self.tenant_id = tenant_id
    
    def signup(self, email, password, name):
        response = requests.post(
            f'{self.base_url}/api/auth/sign-up/email',
            headers={
                'Content-Type': 'application/json',
                'X-Tenant-Id': self.tenant_id
            },
            json={'email': email, 'password': password, 'name': name}
        )
        return response.json()
```

## Data Isolation Guarantee

✅ **100% Database-Level Isolation**

Setiap tenant memiliki schema PostgreSQL terpisah:
- POS users → Stored in `tenant_pos.users`
- Ticket users → Stored in `tenant_ticket.users`
- Crypto users → Stored in `tenant_crypto.users`

**Cross-tenant access TIDAK MUNGKIN terjadi** karena:
1. Data fisik terpisah di database level
2. Better Auth instance per-tenant dengan isolated Prisma client
3. Tenant middleware memvalidasi setiap request

## Admin Endpoints

Admin endpoints ter-protected dan disabled by default.

### Enable Admin Endpoints

Set environment variable:
```bash
ADMIN_API_KEY="your-secure-random-api-key-here"
```

### Access Admin Endpoints

```bash
# List all tenants
curl https://your-auth-service.com/admin/tenants \
  -H "X-Admin-API-Key: your-secure-random-api-key-here"

# Get connection stats
curl https://your-auth-service.com/admin/stats \
  -H "X-Admin-API-Key: your-secure-random-api-key-here"
```

## Adding New Tenant

### 1. Insert Tenant ke Registry

```sql
INSERT INTO public.tenants (id, name, slug, schema_name, status) 
VALUES ('new_app', 'New Application', 'new-app', 'tenant_new_app', 'active');
```

### 2. Provision Schema

```typescript
// Run provisioning script
npx tsx src/multi-tenant/provision-schemas.ts
```

Atau manual:
```sql
-- Create schema
CREATE SCHEMA tenant_new_app;

-- Clone Better Auth tables
CREATE TABLE tenant_new_app.users (LIKE public.users INCLUDING ALL);
CREATE TABLE tenant_new_app.accounts (LIKE public.accounts INCLUDING ALL);
CREATE TABLE tenant_new_app.sessions (LIKE public.sessions INCLUDING ALL);
-- ... clone semua Better Auth tables
```

### 3. Reload Tenant Registry

```bash
# Restart auth service
# Tenant manager akan auto-reload registry on startup
```

## Security Best Practices

1. **Always use HTTPS** in production
2. **Never expose ADMIN_API_KEY** in client code
3. **Rotate BETTER_AUTH_SECRET** regularly
4. **Monitor tenant access logs** via audit table
5. **Set strong ADMIN_API_KEY** (min 32 characters random)

## Environment Variables

Required:
```env
DATABASE_URL="postgresql://user:password@host:port/database"
BETTER_AUTH_URL="https://your-auth-service.com"
BETTER_AUTH_SECRET="min-24-characters-random-secret"
```

Optional:
```env
PORT=5000
TRUSTED_ORIGINS="https://app1.com,https://app2.com"
ADMIN_API_KEY="your-admin-api-key"
ENABLE_DEV_ENDPOINTS="false"
```

## Troubleshooting

### Error: "TENANT_REQUIRED"
→ Tambahkan `X-Tenant-Id` header ke request

### Error: "TENANT_NOT_FOUND"  
→ Tenant belum di-provision atau inactive

### Error: "INVALID_EMAIL_OR_PASSWORD" padahal credentials benar
→ Pastikan `X-Tenant-Id` sesuai dengan tenant tempat user sign up

### Admin endpoints return 503
→ Set `ADMIN_API_KEY` environment variable

## Support

For questions atau issues, check:
- `MULTI_TENANT_IMPLEMENTATION.md` - Technical implementation details
- `MULTI_TENANT_SUMMARY.md` - Architecture overview (Bahasa Indonesia)
