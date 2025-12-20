# Realmio Deployment Modes Guide

## Deployment Strategies

This guide covers real-world deployment scenarios for Realmio across different modes.

## Table of Contents

1. [Single-Tenant Deployment](#single-tenant-deployment)
2. [Multi-Tenant Deployment](#multi-tenant-deployment)
3. [Hybrid Deployment](#hybrid-deployment)
4. [Migration Strategies](#migration-strategies)
5. [Cost Comparison](#cost-comparison)

---

## Single-Tenant Deployment

### When to Use

✅ **Use single-tenant mode when**:
- Dedicated Realmio instance per application
- Complete isolation from other services
- Application has strict compliance requirements
- Simple operational model preferred
- Budget for multiple instances

### Architecture

```
┌─────────────────────────────────────┐
│  Realmio-POS (Dedicated Instance)  │
│                                     │
│  ENV:                               │
│  - AUTH_MODE=single                 │
│  - TENANT_ID=pos                    │
│  - DATABASE_URL=pos-db              │
│                                     │
│  Database: pos_auth_db              │
│  Size: ~5 GB                        │
└─────────────────────────────────────┘
        ↓ (API calls)
┌─────────────────────────────────────┐
│      POS Application                │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Realmio-Crypto (Separate)         │
│                                     │
│  ENV:                               │
│  - AUTH_MODE=single                 │
│  - TENANT_ID=crypto                 │
│  - DATABASE_URL=crypto-db           │
│                                     │
│  Database: crypto_auth_db           │
│  Size: ~3 GB                        │
└─────────────────────────────────────┘
        ↓ (API calls)
┌─────────────────────────────────────┐
│      Crypto Exchange App            │
└─────────────────────────────────────┘
```

### Deployment Steps

```bash
# Server 1: POS Realmio
cd authcore-pos
cat > .env << EOF
AUTH_MODE=single
TENANT_ID=pos
DATABASE_URL=postgresql://pos:pass@pos-db:5432/authcore
BETTER_AUTH_SECRET=pos-secret-xxx
BETTER_AUTH_URL=https://pos-auth.example.com
TRUSTED_ORIGINS=https://pos.example.com
PORT=5000
EOF

bash scripts/setup-single.sh
npm run build
npm start

# Server 2: Crypto Realmio
cd authcore-crypto
cat > .env << EOF
AUTH_MODE=single
TENANT_ID=crypto
DATABASE_URL=postgresql://crypto:pass@crypto-db:5432/authcore
BETTER_AUTH_SECRET=crypto-secret-yyy
BETTER_AUTH_URL=https://crypto-auth.example.com
TRUSTED_ORIGINS=https://crypto.example.com
PORT=5000
EOF

bash scripts/setup-single.sh
npm run build
npm start
```

### Pros & Cons

**Advantages**:
- ✅ Complete isolation
- ✅ Simpler codebase (no multi-tenant logic)
- ✅ Easier debugging
- ✅ Independent scaling
- ✅ No noisy neighbor issues

**Disadvantages**:
- ❌ Higher infrastructure cost (3x servers + databases)
- ❌ More operational overhead (3x deployments)
- ❌ Code updates must be deployed 3 times
- ❌ Harder to share improvements across instances

**Cost**: ~$255/month (3 instances @ $85 each)

---

## Multi-Tenant Deployment

### When to Use

✅ **Use multi-tenant mode when**:
- Multiple independent applications
- Applications are not multi-tenant themselves
- Cost optimization important
- Centralized auth management desired
- Faster feature rollout needed

### Architecture

```
┌───────────────────────────────────────────────────┐
│       Centralized Realmio (Multi-Tenant)         │
│                                                   │
│  ENV:                                             │
│  - AUTH_MODE=multi                                │
│  - NESTED_TENANCY_ENABLED=false                   │
│  - DATABASE_URL=central-db                        │
│                                                   │
│  Database: central_auth_db (30 GB)                │
│  ├── public.tenants (registry)                    │
│  ├── tenant_pos schema (10 GB)                    │
│  ├── tenant_crypto schema (5 GB)                  │
│  ├── tenant_ticket schema (8 GB)                  │
│  └── tenant_laundry schema (7 GB)                 │
└───────────────────────────────────────────────────┘
      ↓              ↓              ↓              ↓
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│   POS    │  │  Crypto  │  │ Ticketing│  │ Laundry  │
│   App    │  │ Exchange │  │   App    │  │   App    │
└──────────┘  └──────────┘  └──────────┘  └──────────┘

Tenant Identification:
- Header: X-Tenant-Id: pos
- Subdomain: pos.auth.example.com
- Path: /tenant/pos/api/auth/...
```

### Deployment Steps

```bash
cd authcore-central

cat > .env << EOF
AUTH_MODE=multi
NESTED_TENANCY_ENABLED=false
DATABASE_URL=postgresql://auth:pass@central-db:5432/authcore
BETTER_AUTH_SECRET=central-secret-xxx
BETTER_AUTH_URL=https://auth.example.com
TRUSTED_ORIGINS=https://pos.example.com,https://crypto.example.com,https://ticket.example.com
PORT=5000
EOF

# Setup multi-tenant
bash scripts/setup-multi.sh

# Build and start
npm run build
npm start

# Applications configure tenant ID
# POS app: X-Tenant-Id: pos
# Crypto app: X-Tenant-Id: crypto
```

### Pros & Cons

**Advantages**:
- ✅ Cost-effective (1 server, 1 database)
- ✅ Single deployment pipeline
- ✅ Shared improvements across all apps
- ✅ Centralized monitoring
- ✅ Easier to maintain

**Disadvantages**:
- ❌ Single point of failure
- ❌ One tenant can affect others (noisy neighbor)
- ❌ More complex codebase
- ❌ Requires careful capacity planning

**Cost**: ~$85/month (1 instance)

---

## Hybrid Deployment

### When to Use

✅ **Use hybrid mode when**:
- Some applications are themselves multi-tenant
- Need organization-level isolation
- Complex tenant hierarchies
- SaaS platforms with customers having sub-organizations

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│          Centralized Realmio (Hybrid Mode)                 │
│                                                             │
│  ENV:                                                       │
│  - AUTH_MODE=multi                                          │
│  - NESTED_TENANCY_ENABLED=true                              │
│  - DATABASE_URL=central-db                                  │
│                                                             │
│  Database: central_auth_db (50 GB)                          │
│  ├── public.tenants (registry)                              │
│  ├── public.application_sub_tenants (nested registry)       │
│  ├── tenant_pos schema (20 GB)                              │
│  │   └── Organizations: Cafe A, Cafe B, Restaurant C...     │
│  ├── tenant_crypto schema (5 GB)                            │
│  ├── tenant_ticket schema (8 GB)                            │
│  └── tenant_laundry schema (17 GB)                          │
│      └── Organizations: Laundry A, Laundry B...             │
└─────────────────────────────────────────────────────────────┘
      ↓                  ↓                 ↓
┌──────────────┐  ┌──────────┐  ┌──────────────┐
│   POS App    │  │  Crypto  │  │  Laundry App │
│ (Multi-Org)  │  │ (Single) │  │ (Multi-Org)  │
│              │  │          │  │              │
│ - Cafe A     │  └──────────┘  │ - Laundry A  │
│ - Cafe B     │                │ - Laundry B  │
│ - Resto C    │                └──────────────┘
└──────────────┘

Hierarchical Tenant ID:
- pos::cafe-a (POS tenant, Cafe A sub-tenant)
- pos::cafe-b (POS tenant, Cafe B sub-tenant)
- laundry::laundry-a
```

### Deployment Steps

```bash
cd authcore-central

cat > .env << EOF
AUTH_MODE=multi
NESTED_TENANCY_ENABLED=true
DATABASE_URL=postgresql://auth:pass@central-db:5432/authcore
BETTER_AUTH_SECRET=central-secret-xxx
BETTER_AUTH_URL=https://auth.example.com
TRUSTED_ORIGINS=https://*.pos.example.com,https://*.laundry.example.com
PORT=5000
EOF

# Setup hybrid mode
bash scripts/setup-nested.sh

# Build and start
npm run build
npm start

# Applications use hierarchical tenant IDs
# POS Cafe A: X-Tenant-Id: pos::cafe-a
# POS Cafe B: X-Tenant-Id: pos::cafe-b
```

### Pros & Cons

**Advantages**:
- ✅ Supports complex multi-tenant apps
- ✅ Organization-level data isolation
- ✅ Scalable to hundreds of sub-tenants
- ✅ Flexible isolation modes per app

**Disadvantages**:
- ❌ More complex architecture
- ❌ Larger database size
- ❌ Higher operational complexity
- ❌ Requires understanding of nested tenancy

**Cost**: ~$120/month (larger instance + database)

---

## Migration Strategies

### Scenario 1: Start Simple, Scale Later

**Path**: Single → Multi → Hybrid

```bash
# Year 1: Single-tenant POS
AUTH_MODE=single
TENANT_ID=pos

# Year 2: Add Crypto app, switch to Multi
# 1. Setup multi-tenant Realmio
bash scripts/setup-multi.sh

# 2. Migrate POS data to tenant_pos schema
pg_dump -n public old_pos_db > pos_data.sql
psql new_central_db -c "SET search_path TO tenant_pos"
psql new_central_db < pos_data.sql

# 3. Add new tenant: crypto
INSERT INTO public.tenants (id, name, slug, schema_name) 
VALUES ('crypto', 'Crypto Exchange', 'crypto', 'tenant_crypto');

# Year 3: POS needs sub-tenants, enable Hybrid
NESTED_TENANCY_ENABLED=true
bash scripts/setup-nested.sh
```

### Scenario 2: Split Large Tenant

**Path**: Multi → Multi + Single (hybrid deployment)

```bash
# Original: All in one multi-tenant Realmio
# Problem: POS tenant too large (50 GB, 80% of traffic)

# Solution: Spin out POS to dedicated instance

# 1. Export POS tenant schema
pg_dump -n tenant_pos central_db > pos_export.sql

# 2. Create new POS Realmio
cd authcore-pos
AUTH_MODE=single
TENANT_ID=pos
DATABASE_URL=<new_pos_db>
bash scripts/setup-single.sh

# 3. Import POS data
psql $DATABASE_URL < pos_export.sql

# 4. Update POS app to point to new Realmio
# OLD: https://auth.example.com with X-Tenant-Id: pos
# NEW: https://pos-auth.example.com (no tenant header)

# 5. Drop POS from central Realmio
DELETE FROM public.tenants WHERE id = 'pos';
DROP SCHEMA tenant_pos CASCADE;
```

---

## Cost Comparison

### Infrastructure Costs (Monthly)

| Scenario | Deployment | Compute | Database | Total |
|----------|------------|---------|----------|-------|
| 3 Single Instances | 3x Replit Autoscale | 3x $50 | 3x $25 | **$255** |
| Centralized Multi | 1x Replit Autoscale | 1x $50 | 1x $25 | **$85** |
| Hybrid (Nested) | 1x Replit Autoscale | 1x $75 | 1x $45 | **$120** |
| Split (1 Multi + 1 Single) | 2x Replit | 2x $50 | 2x $25 | **$170** |

### Development & Maintenance Costs

| Task | Single (3x) | Multi | Hybrid |
|------|-------------|-------|--------|
| Bug fix deployment | 3 hours | 1 hour | 1 hour |
| Feature rollout | 6 hours | 2 hours | 2 hours |
| Security patch | 3 deploys | 1 deploy | 1 deploy |
| Monitoring setup | 3x effort | 1x effort | 1x effort |

---

## Best Practices

### Start Small, Scale Smart

1. **Begin with Multi-Tenant** for cost efficiency
2. **Monitor metrics**: Database size, latency, connection pool
3. **Set thresholds**: If tenant > 50 GB → consider splitting
4. **Plan migration**: Have runbook ready for spin-out

### High-Availability Setup

```yaml
# Production multi-tenant with HA
Compute:
  - 2x Realmio instances (load balanced)
  - Health check: /healthz
  - Auto-restart on failure

Database:
  - PostgreSQL with read replicas
  - Automated backups (daily)
  - Point-in-time recovery

Monitoring:
  - Per-tenant latency tracking
  - Connection pool saturation alerts
  - Database size growth alerts
```

### Security Considerations

- **Single-Tenant**: Easier to audit, isolated attack surface
- **Multi-Tenant**: Requires strict tenant validation, risk of data leakage
- **Hybrid**: Most complex, needs organization-level access controls

---

## Decision Matrix

| Factor | Single | Multi | Hybrid |
|--------|--------|-------|--------|
| **Initial Cost** | High | Low | Medium |
| **Operational Complexity** | Low | Medium | High |
| **Isolation** | Excellent | Good | Good |
| **Scalability** | Excellent | Good | Excellent |
| **Feature Velocity** | Slow | Fast | Fast |
| **Best For** | Compliance, Large apps | Startups, SMBs | SaaS platforms |

---

## Next Steps

- [Installation Guide](./INSTALLATION.md)
- [Configuration Guide](./CONFIGURATION.md)
- [Testing Guide](./TESTING.md)
- [API Documentation](./API.md)
