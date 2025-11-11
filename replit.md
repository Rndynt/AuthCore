# AuthCore - Modular Multi-Tenant Authentication Service

## Project Overview
Flexible, modular authentication service built with Better Auth and Fastify. Supports three operational modes: single-tenant (dedicated), multi-tenant (shared), and hybrid (nested multi-tenancy).

## Architecture

### Core Technology
- **Backend**: Fastify server with Better Auth integration
- **Database**: PostgreSQL with configurable isolation strategies
- **Multi-Tenancy**: Modular support for different deployment patterns
- **Deployment**: Replit Autoscale with environment-based configuration

### Operational Modes

#### 1. Single-Tenant Mode (Standalone)
```env
AUTH_MODE=single
TENANT_ID=pos
```
- Dedicated instance for one application
- No tenant registry needed
- Simplest deployment model
- Ideal for: Isolated instances, compliance requirements

#### 2. Multi-Tenant Mode (Flat)
```env
AUTH_MODE=multi
NESTED_TENANCY_ENABLED=false
```
- Shared instance for multiple applications
- Schema-level tenant isolation
- Tenant registry in public schema
- Ideal for: Cost efficiency, centralized auth

#### 3. Hybrid Mode (Nested Multi-Tenancy)
```env
AUTH_MODE=multi
NESTED_TENANCY_ENABLED=true
```
- Multi-tenant applications with sub-organizations
- Supports hierarchical tenant structures (e.g., pos::cafe-a)
- Organization-based isolation within tenant schemas
- Ideal for: SaaS platforms, complex multi-tenant apps

## Recent Updates (Nov 11, 2025)

### 🔧 Latest: CORS & Auth Mode Configuration Fixed (Today)

**Critical Fixes Applied**:
- ✅ Fixed AUTH_MODE default to "multi" (was incorrectly set to "single")
- ✅ Fixed CORS configuration to support Replit subdomain variants
- ✅ Added automatic tilde subdomain pattern detection (`~00-xxx.spock.replit.dev`)
- ✅ Verified suspend/activate tenant functionality works correctly
- ✅ Verified cross-tenant user listing displays data from all schemas
- ✅ Tested admin login from both main and tilde subdomains - working perfectly

**CORS Configuration**:
The system now automatically detects and trusts both Replit domain patterns:
- Main: `https://685e8f81-1086-426a-bd4b-a3ccc7f50067-00-m92ps5cyz1gx.spock.replit.dev`
- Tilde: `https://~00-m92ps5cyz1gx.spock.replit.dev`

This resolves `INVALID_ORIGIN` errors when accessing from mobile or different subdomains.

### 🚀 Previous: Complete Database & Admin UI Setup (Oct 30, 2025)

**Database Setup Complete**:
- ✅ PostgreSQL database provisioned via Replit
- ✅ Prisma schema migrations executed successfully
- ✅ Multi-tenant registry tables created (`public.tenants`, `public.applications`, `public.tenant_audit_log`)
- ✅ Admin authentication schema created (`authcore_system`)
- ✅ Initial tenant data seeded (POS, Ticketing, Crypto)
- ✅ Better Auth tables created in all schemas

**Admin UI Deployed**:
- ✅ Next.js admin dashboard running on port 3000
- ✅ Dependencies installed and configured
- ✅ API client configured to connect to Auth Service
- ✅ Admin login, tenant management, and audit log pages active
- ✅ React Query integration for efficient data fetching
- ✅ Tailwind CSS + shadcn/ui components

**Both Services Running**:
- 🟢 Auth Service: Port 5000 (Backend API)
- 🟢 Admin UI: Port 3000 (Dashboard Interface)

### ✨ Modular Architecture Implementation

Implemented configurable multi-mode AuthCore with complete flexibility:

**New Features**:
- ✅ Config layer with feature flags (`src/config/`)
- ✅ Single-tenant manager for standalone deployments
- ✅ Sub-tenant manager for nested tenancy
- ✅ Mode-aware server initialization
- ✅ Conditional route registration
- ✅ Automated setup scripts for all modes
- ✅ Admin authentication system with isolated schema

**Project Structure**:
```
src/
├── config/
│   ├── auth-mode.ts        # Mode selection & validation
│   └── features.ts         # Feature flag management
├── multi-tenant/
│   ├── connection-manager.ts      # Multi-tenant connections
│   ├── single-tenant-manager.ts   # Single-tenant mode
│   ├── sub-tenant-manager.ts      # Nested tenancy support
│   ├── schema.sql                 # Tenant registry tables
│   ├── nested-schema.sql          # Sub-tenant tables (optional)
│   └── provision-schemas.ts       # Schema provisioning
├── admin/
│   ├── auth.ts            # Admin authentication (authcore_system)
│   ├── routes.ts          # Admin API endpoints
│   └── tenant-service.ts  # Tenant management logic
├── server.ts               # Mode-aware server
└── auth.ts                 # Better Auth core

admin-ui/                   # Next.js Admin Dashboard
├── app/
│   ├── (auth)/login       # Admin login page
│   └── (dashboard)/       # Dashboard, tenants, audit pages
├── components/            # UI components (shadcn/ui)
└── lib/
    └── api-client.ts      # API integration layer

scripts/
├── setup-admin.sh          # Admin system setup
├── setup-admin-schema.sql  # Admin schema definition
├── setup-single.sh         # Single-tenant setup
├── setup-multi.sh          # Multi-tenant setup
└── setup-nested.sh         # Hybrid mode setup

docs/
├── INSTALLATION.md         # Installation guide
├── CONFIGURATION.md        # Configuration reference
├── DEPLOYMENT_MODES.md     # Deployment strategies
└── TESTING.md              # Testing guide
```

**Documentation**:
- 📚 Complete installation guides for all modes
- 📚 Configuration reference with examples
- 📚 Deployment strategy comparisons
- 📚 Testing scripts and procedures

### Database Initialization (Previous Setup)
- Created PostgreSQL database using Replit's built-in service
- Set up multi-tenant registry tables (tenants, applications, audit log)
- Provisioned tenant-specific schemas: `tenant_pos`, `tenant_ticket`, `tenant_crypto`
- Cloned Better Auth tables into each tenant schema for data isolation
- Fixed Prisma schema conflict by removing duplicate Tenant model

## Current Setup Status

### ✅ Ready to Use

The system is fully configured and running in **Multi-Tenant Mode**:

**Access Points**:
- 🔐 **Auth API**: `https://6ecc1592-e8ff-4c2d-93f0-a18e23e81569-00-26dz3yxz4o5s8.picard.replit.dev`
- 📊 **Admin Dashboard**: Port 3000 (via Replit console)

**Active Tenants** (3):
1. `pos` - POS Kasir System
2. `ticket` - Ticketing Platform  
3. `crypto` - Crypto Exchange

**Admin System**:
- Schema: `authcore_system` (isolated from tenant data)
- First time setup: Create admin user via `/admin/auth/sign-up/email`

### 🎯 Next Steps

1. **Create Admin User** (if not already created):
   ```bash
   curl -X POST http://localhost:5000/admin/auth/sign-up/email \
     -H 'Content-Type: application/json' \
     -d '{"email":"admin@authcore.local","password":"AuthCore123!","name":"Admin"}'
   ```

2. **Access Admin Dashboard**:
   - Open Admin UI on port 3000
   - Login with admin credentials
   - Manage tenants, view metrics, audit logs

3. **Test Authentication**:
   ```bash
   # Sign up a user in POS tenant
   curl -X POST http://localhost:5000/api/auth/sign-up/email \
     -H 'X-Tenant-Id: pos' \
     -H 'Content-Type: application/json' \
     -d '{"email":"user@pos.com","password":"User123!"}'
   ```

## Quick Start

### Choose Your Deployment Mode

#### Option A: Single-Tenant (Dedicated Instance)
```bash
# .env
AUTH_MODE=single
TENANT_ID=pos
DATABASE_URL=postgresql://...

# Setup
bash scripts/setup-single.sh
npm run dev
```

#### Option B: Multi-Tenant (Shared Instance)
```bash
# .env
AUTH_MODE=multi
NESTED_TENANCY_ENABLED=false
DATABASE_URL=postgresql://...

# Setup
bash scripts/setup-multi.sh
npm run dev
```

#### Option C: Hybrid (Nested Multi-Tenancy)
```bash
# .env
AUTH_MODE=multi
NESTED_TENANCY_ENABLED=true
DATABASE_URL=postgresql://...

# Setup
bash scripts/setup-nested.sh
npm run dev
```

## API Usage

### Single-Tenant Mode
```bash
# Direct API calls (no tenant header needed)
curl -X POST http://localhost:5000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"Pass123!"}'
```

### Multi-Tenant Mode
```bash
# Requires tenant identification
curl -X POST http://localhost:5000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-Id: pos' \
  -d '{"email":"user@example.com","password":"Pass123!"}'
```

### Hybrid Mode (Nested)
```bash
# Hierarchical tenant identification
curl -X POST http://localhost:5000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-Id: pos::cafe-a' \
  -d '{"email":"staff@cafea.com","password":"Pass123!"}'
```

## Environment Variables

### Required (All Modes)
- `DATABASE_URL`: PostgreSQL connection string
- `BETTER_AUTH_SECRET`: Secret for signing tokens
- `BETTER_AUTH_URL`: Public URL of AuthCore

### Mode Configuration
- `AUTH_MODE`: `single` or `multi` (default: `multi`)
- `NESTED_TENANCY_ENABLED`: `true` or `false` (default: `false`)

### Single-Tenant Only
- `TENANT_ID`: Fixed tenant identifier (required)
- `TENANT_SCHEMA`: Database schema (default: `public`)

### Optional
- `PORT`: Server port (default: `5000`)
- `ENABLE_DEV_ENDPOINTS`: Enable dev/test endpoints (default: `false`)
- `TRUSTED_ORIGINS`: Comma-separated CORS origins

## Development Workflow

### Current Setup (Multi-Tenant Mode)
```bash
# Running in multi-tenant mode with 3 tenants
AUTH_MODE=multi
NESTED_TENANCY_ENABLED=false

# Active tenants:
- pos (POS Kasir)
- ticket (Ticketing System)
- crypto (Crypto Exchange)
```

### Testing
```bash
# Test current mode
curl http://localhost:5000/healthz

# Test signup (multi-tenant)
curl -X POST http://localhost:5000/api/auth/sign-up/email \
  -H 'X-Tenant-Id: pos' \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"Test123!"}'
```

## Migration Between Modes

### From Multi to Single (Split Instance)
```bash
# 1. Export tenant data
pg_dump -n tenant_pos $SOURCE_DB > pos_export.sql

# 2. Setup new single-tenant instance
AUTH_MODE=single
TENANT_ID=pos
DATABASE_URL=<new_db>
bash scripts/setup-single.sh

# 3. Import data
psql $DATABASE_URL < pos_export.sql
```

### From Single to Multi (Consolidate)
```bash
# 1. Setup multi-tenant instance
AUTH_MODE=multi
bash scripts/setup-multi.sh

# 2. Import single-tenant data into tenant schema
psql -c "SET search_path TO tenant_pos"
psql < single_tenant_export.sql
```

## Key Features

### Modular Design
- ✅ No lock-in to specific mode
- ✅ Easy to clone for dedicated instances
- ✅ Optional nested tenancy tables
- ✅ Feature flags for conditional functionality

### Flexibility
- ✅ Start simple, scale later
- ✅ Mix deployment models (some single, some multi)
- ✅ Progressive enhancement path
- ✅ Backward compatible

### Security
- ✅ Strict tenant isolation (schema-level)
- ✅ Organization-based sub-tenant isolation
- ✅ CORS validation
- ✅ Audit logging

## Database Schema

### Single-Tenant
- Better Auth tables only (~12 tables)
- Schema: `public` or custom schema
- Size: ~2-5 GB per instance

### Multi-Tenant
- Tenant registry: `public.tenants`, `public.applications`
- Better Auth tables per tenant schema
- Size: ~20-30 GB (for 5 apps)

### Hybrid (Nested)
- All multi-tenant tables +
- `public.application_sub_tenants`
- Organization isolation within schemas
- Size: ~20-50 GB (with hundreds of sub-tenants)

## Deployment

### Build & Start
```bash
npm run build    # Compile TypeScript
npm start        # Production server
```

### Environment-Specific
- **Development**: `npm run dev` with hot reload
- **Production**: `npm start` with compiled code

### Replit Deployment
- Autoscale deployment configured
- Port 5000 exposed
- Database integration via environment variables

## Troubleshooting

### Mode Mismatch
```
Error: TENANT_ID required
→ Set TENANT_ID in .env for single-tenant mode
```

### Table Not Found
```
Error: relation "public.tenants" does not exist
→ Run: bash scripts/setup-multi.sh
```

### CORS Issues
```
Origin not allowed
→ Add to TRUSTED_ORIGINS in .env
```

## Documentation

Comprehensive documentation available in `docs/`:
- [Installation Guide](docs/INSTALLATION.md)
- [Configuration Reference](docs/CONFIGURATION.md)
- [Deployment Strategies](docs/DEPLOYMENT_MODES.md)
- [Testing Guide](docs/TESTING.md)

## Technical Stack

- **Runtime**: Node.js 20+
- **Framework**: Fastify 5.x
- **Auth**: Better Auth 1.x
- **Database**: PostgreSQL 14+ (Neon-backed)
- **ORM**: Prisma 6.x
- **Language**: TypeScript 5.x

## Contributing

When modifying AuthCore:
1. Test all three modes
2. Update documentation
3. Ensure backward compatibility
4. Follow modular design principles
