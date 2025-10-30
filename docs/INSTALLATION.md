# AuthCore Installation Guide

## Overview

AuthCore supports three operational modes:
1. **Single-Tenant Mode**: Dedicated instance for one application
2. **Multi-Tenant Mode**: Shared instance for multiple applications (flat)
3. **Hybrid Mode**: Multi-tenant with nested sub-tenancy support

## Prerequisites

- Node.js 18+ or 20+
- PostgreSQL database
- npm or pnpm package manager

## Quick Start

### 1. Clone and Install

```bash
git clone <your-authcore-repo>
cd authcore
npm install
```

### 2. Choose Your Mode

#### Option A: Single-Tenant Mode (Standalone Instance)

**When to use**: Dedicated AuthCore for one application (e.g., separate instance for POS only)

```bash
# Create .env file
cat > .env << EOF
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Single-Tenant Mode
AUTH_MODE=single
TENANT_ID=pos
TENANT_SCHEMA=public

# Better Auth Configuration
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_URL=https://your-domain.com

# Trusted Origins (CORS)
TRUSTED_ORIGINS=https://your-frontend.com,http://localhost:3000
EOF

# Run setup script
bash scripts/setup-single.sh

# Start server
npm run dev
```

**Database size**: ~2-5 GB (depending on users)  
**Complexity**: ⭐ Simple  
**Best for**: Dedicated instances, isolated deployments

---

#### Option B: Multi-Tenant Mode (Flat)

**When to use**: Multiple applications without nested sub-tenants

```bash
# Create .env file
cat > .env << EOF
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Multi-Tenant Mode
AUTH_MODE=multi
NESTED_TENANCY_ENABLED=false

# Better Auth Configuration
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_URL=https://your-domain.com

# Trusted Origins (CORS)
TRUSTED_ORIGINS=https://app1.com,https://app2.com,http://localhost:3000
EOF

# Run setup script
bash scripts/setup-multi.sh

# Start server
npm run dev
```

**Database size**: ~10-30 GB (for 5 apps with moderate usage)  
**Complexity**: ⭐⭐ Moderate  
**Best for**: Centralized auth for multiple independent apps

---

#### Option C: Hybrid Mode (Nested Multi-Tenancy)

**When to use**: Applications that themselves are multi-tenant (e.g., POS serving multiple cafes)

```bash
# Create .env file
cat > .env << EOF
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Hybrid Mode with Nested Tenancy
AUTH_MODE=multi
NESTED_TENANCY_ENABLED=true

# Better Auth Configuration
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_URL=https://your-domain.com

# Trusted Origins (CORS)
TRUSTED_ORIGINS=https://app1.com,https://app2.com,http://localhost:3000
EOF

# Run setup script
bash scripts/setup-nested.sh

# Start server
npm run dev
```

**Database size**: ~20-50 GB (with hundreds of sub-tenants)  
**Complexity**: ⭐⭐⭐ Advanced  
**Best for**: Complex multi-tenant applications with sub-organizations

---

## Environment Variables Reference

### Required (All Modes)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host/db` |
| `BETTER_AUTH_SECRET` | Secret for signing tokens | Generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Public URL of AuthCore | `https://auth.yourcompany.com` |

### Mode Configuration

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `AUTH_MODE` | `single`, `multi` | `multi` | Operating mode |
| `NESTED_TENANCY_ENABLED` | `true`, `false` | `false` | Enable nested tenancy |

### Single-Tenant Mode Only

| Variable | Description | Example |
|----------|-------------|---------|
| `TENANT_ID` | Fixed tenant identifier | `pos` |
| `TENANT_SCHEMA` | Database schema name | `public` or `tenant_pos` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `ENABLE_DEV_ENDPOINTS` | Enable dev/testing endpoints | `false` |
| `TRUSTED_ORIGINS` | Comma-separated CORS origins | (empty) |
| `NODE_ENV` | Environment | `development` |

## Verification

After installation, verify your setup:

```bash
# Health check
curl http://localhost:5000/healthz

# Expected response:
{
  "ok": true,
  "mode": "multi",
  "features": {
    "tenantRegistry": true,
    "nestedTenancy": false
  }
}
```

## Database Schema

### Single-Tenant Mode

- Better Auth tables only (users, sessions, accounts, etc.)
- ~12 tables total
- Simple schema in `public` or custom schema

### Multi-Tenant Mode

- Tenant registry: `public.tenants`, `public.applications`
- Better Auth tables replicated in each tenant schema
- ~15 tables in public, ~12 tables per tenant schema

### Hybrid Mode

- All multi-tenant tables +
- `public.application_sub_tenants` for nested tenancy
- Organization-based isolation within tenant schemas

## Troubleshooting

### Error: TENANT_ID required

**Solution**: You're in single-tenant mode but didn't set `TENANT_ID`
```bash
export TENANT_ID=pos
```

### Error: relation "public.tenants" does not exist

**Solution**: Run the appropriate setup script
```bash
bash scripts/setup-multi.sh
```

### Port 5000 already in use

**Solution**: Change port in .env
```bash
export PORT=5001
```

## Next Steps

- [Configuration Guide](./CONFIGURATION.md)
- [Deployment Guide](./DEPLOYMENT_MODES.md)
- [Testing Guide](./TESTING.md)
- [API Documentation](./API.md)
