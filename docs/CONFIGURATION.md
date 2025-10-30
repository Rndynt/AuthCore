# AuthCore Configuration Guide

## Configuration Modes

AuthCore uses a modular configuration system that adapts to your deployment needs.

## Mode Selection

### Decision Tree

```
Do you need AuthCore for multiple applications?
├─ No  → AUTH_MODE=single (Standalone)
└─ Yes → AUTH_MODE=multi
         │
         Do your applications have their own sub-tenants?
         ├─ No  → NESTED_TENANCY_ENABLED=false (Flat)
         └─ Yes → NESTED_TENANCY_ENABLED=true (Hybrid)
```

## Configuration Files

### `.env` File Structure

```bash
# ======================
# DATABASE CONFIGURATION
# ======================
DATABASE_URL=postgresql://user:password@host:5432/dbname

# ======================
# MODE CONFIGURATION
# ======================
# Options: 'single' | 'multi'
AUTH_MODE=multi

# Only applicable when AUTH_MODE=multi
# Options: 'true' | 'false'
NESTED_TENANCY_ENABLED=false

# Required when AUTH_MODE=single
TENANT_ID=pos
TENANT_SCHEMA=public

# ======================
# BETTER AUTH CONFIGURATION
# ======================
# Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=your-super-secret-key-here

# Public URL of this AuthCore instance
BETTER_AUTH_URL=https://auth.yourcompany.com

# ======================
# SERVER CONFIGURATION
# ======================
PORT=5000
NODE_ENV=production

# ======================
# CORS CONFIGURATION
# ======================
# Comma-separated list of allowed origins
TRUSTED_ORIGINS=https://pos.com,https://crypto.com,http://localhost:3000

# ======================
# FEATURE FLAGS
# ======================
# Enable development endpoints (testing only)
ENABLE_DEV_ENDPOINTS=false
```

## Real-World Examples

### Example 1: Dedicated POS AuthCore

```bash
# Standalone instance for POS application only
AUTH_MODE=single
TENANT_ID=pos
TENANT_SCHEMA=public
DATABASE_URL=postgresql://pos_user:pass@pos-db.example.com/pos_auth
BETTER_AUTH_URL=https://pos-auth.example.com
TRUSTED_ORIGINS=https://pos.example.com,https://pos-admin.example.com
```

**Use Case**: 
- Dedicated server for POS
- Isolated from other applications
- Simpler deployment
- Lower operational complexity

### Example 2: Centralized Multi-App AuthCore

```bash
# Single AuthCore serving multiple apps
AUTH_MODE=multi
NESTED_TENANCY_ENABLED=false
DATABASE_URL=postgresql://auth_user:pass@central-db.example.com/authcore
BETTER_AUTH_URL=https://auth.example.com
TRUSTED_ORIGINS=https://pos.example.com,https://crypto.example.com,https://ticket.example.com
```

**Use Case**:
- Centralized authentication
- POS, Crypto Exchange, Ticketing apps
- Shared auth infrastructure
- Cost-effective for startups

### Example 3: Complex Multi-Tenant with Nested Orgs

```bash
# Hybrid mode supporting nested organizations
AUTH_MODE=multi
NESTED_TENANCY_ENABLED=true
DATABASE_URL=postgresql://auth_user:pass@central-db.example.com/authcore
BETTER_AUTH_URL=https://auth.example.com
TRUSTED_ORIGINS=https://*.pos.example.com,https://*.laundry.example.com
```

**Use Case**:
- POS app serving 50+ cafes/restaurants
- Laundry app serving 30+ laundries
- Each sub-tenant needs data isolation
- Organization-based segmentation

## Feature Flags Explained

### `ENABLE_DEV_ENDPOINTS`

**Default**: `false`

**When enabled**:
- Exposes `/dev/*` endpoints for testing
- Create test users, API keys, JWT tokens
- **NEVER enable in production!**

```bash
# Development only
ENABLE_DEV_ENDPOINTS=true
```

**Available endpoints**:
- `/dev/whoami` - Get current session
- `/dev/api-keys` - Manage API keys
- `/dev/jwt/issue` - Issue test JWT tokens
- `/dev/orgs` - Manage organizations

## CORS Configuration

### Trusted Origins

AuthCore validates incoming requests against `TRUSTED_ORIGINS` for security.

```bash
# Single origin
TRUSTED_ORIGINS=https://myapp.com

# Multiple origins
TRUSTED_ORIGINS=https://app1.com,https://app2.com,http://localhost:3000

# Wildcard subdomains (not recommended for production)
TRUSTED_ORIGINS=https://*.example.com
```

**Security Note**: Always use specific domains in production, avoid wildcards.

## Database URL Formats

### Standard PostgreSQL

```bash
DATABASE_URL=postgresql://username:password@hostname:5432/database_name
```

### With SSL (Production)

```bash
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
```

### Neon (Serverless)

```bash
DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
```

### Supabase

```bash
DATABASE_URL=postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres
```

### With Schema (Single-Tenant)

```bash
DATABASE_URL=postgresql://user:pass@host:5432/db?schema=tenant_pos
```

## Validation

AuthCore validates configuration on startup:

```bash
npm run dev
```

**Expected output**:
```
🔧 AuthCore Configuration:
   Mode: MULTI
   Nested Tenancy: ENABLED

🎯 Active Features:
   Tenant Registry: ✅
   Nested Tenancy: ✅
   Tenant Middleware: ✅
   Dev Endpoints: ❌
   Audit Log: ✅
```

## Migration Between Modes

### From Single to Multi

1. Backup your database
2. Change `.env`:
   ```bash
   AUTH_MODE=multi
   # Remove TENANT_ID
   ```
3. Run multi-tenant setup:
   ```bash
   bash scripts/setup-multi.sh
   ```
4. Migrate data to tenant schema

### From Multi to Single (Split Instance)

1. Create new database for dedicated instance
2. Export tenant schema:
   ```bash
   pg_dump -n tenant_pos $SOURCE_DB > pos_schema.sql
   ```
3. Setup new instance:
   ```bash
   AUTH_MODE=single
   TENANT_ID=pos
   DATABASE_URL=<new_db_url>
   ```
4. Import schema:
   ```bash
   psql $DATABASE_URL < pos_schema.sql
   ```
5. Update app configurations to point to new AuthCore

## Troubleshooting

### Invalid Mode Error

```
Error: AUTH_MODE must be 'single' or 'multi'
```

**Solution**: Check `.env` file for typos

### Missing TENANT_ID

```
Error: TENANT_ID is required when AUTH_MODE=single
```

**Solution**: Add `TENANT_ID` to `.env`

### CORS Errors

```
CORS error: Origin not allowed
```

**Solution**: Add origin to `TRUSTED_ORIGINS`

## Best Practices

1. **Use Environment Variables**: Never hardcode secrets
2. **Different Secrets Per Environment**: Dev vs Production
3. **Minimal CORS Origins**: Only allow necessary domains
4. **Disable Dev Endpoints in Production**: Security risk
5. **Use SSL in Production**: Always require SSL for database
6. **Monitor Database Growth**: Set up alerts for size

## Next Steps

- [Installation Guide](./INSTALLATION.md)
- [Deployment Guide](./DEPLOYMENT_MODES.md)
- [API Documentation](./API.md)
