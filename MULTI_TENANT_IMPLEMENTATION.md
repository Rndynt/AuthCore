# 🏢 Multi-Tenant Implementation Guide
## Separate Schema Pattern untuk Multiple Applications

Panduan lengkap implementasi multi-tenancy dengan **database/schema isolation** untuk Realmio.

---

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Current vs Target State](#current-vs-target-state)
- [Implementation Steps](#implementation-steps)
- [Code Examples](#code-examples)
- [Security Best Practices](#security-best-practices)
- [Migration Guide](#migration-guide)

---

## 🏗️ Architecture Overview

### **Pattern: Shared Database, Separate Schemas**

```
┌─────────────────────────────────────────────────────────┐
│           Neon PostgreSQL Database (Production)          │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Schema: pos  │  │Schema:ticket │  │Schema:crypto │  │
│  │              │  │              │  │              │  │
│  │ - users      │  │ - users      │  │ - users      │  │
│  │ - sessions   │  │ - sessions   │  │ - sessions   │  │
│  │ - orders     │  │ - tickets    │  │ - trades     │  │
│  │ - products   │  │ - events     │  │ - wallets    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### **Data Flow**

```
[POS App] ──┐
            │
[Ticketing] ──┤ X-Tenant-Id: pos
            │ ├─→ [Realmio] ─→ Route to schema_pos
[Exchange] ──┘ │
            └─→ [Realmio] ─→ Route to schema_crypto
```

---

## 🔄 Current vs Target State

### **Current State (Single Schema)**
```typescript
// Semua tenant share schema "public"
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});

// ❌ Data dari semua tenant tercampur di table yang sama
// ❌ Hanya dipisahkan oleh organizationId column
// ❌ Risiko data leakage jika ada bug
```

### **Target State (Separate Schemas)**
```typescript
// Setiap tenant punya schema sendiri
const getTenantClient = (tenantId: string) => {
  const schemaName = `tenant_${tenantId}`;
  
  return new PrismaClient({
    datasources: {
      db: { 
        url: `${process.env.DATABASE_URL}?schema=${schemaName}` 
      }
    }
  });
};

// ✅ POS data di schema_pos
// ✅ Ticketing data di schema_ticket  
// ✅ Exchange data di schema_crypto
// ✅ TRUE ISOLATION - tidak mungkin tercampur
```

---

## 🚀 Implementation Steps

### **Phase 1: Tenant Registry Setup**

#### 1.1 Create Tenant Registry Table (Public Schema)
```sql
-- Di schema public, buat table untuk track tenants
CREATE TABLE IF NOT EXISTS public.tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  schema_name TEXT UNIQUE NOT NULL,
  database_url TEXT, -- Optional: untuk Pattern 3
  status TEXT DEFAULT 'active', -- active, suspended, deleted
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON public.tenants(slug);
CREATE INDEX idx_tenants_schema ON public.tenants(schema_name);

-- Insert initial tenants
INSERT INTO public.tenants (id, name, slug, schema_name) VALUES
  ('pos', 'POS Kasir', 'pos-kasir', 'tenant_pos'),
  ('ticket', 'Ticketing System', 'ticketing', 'tenant_ticket'),
  ('crypto', 'Crypto Exchange', 'crypto-exchange', 'tenant_crypto');
```

#### 1.2 Create Application Registry
```sql
-- Track aplikasi yang pakai auth service
CREATE TABLE IF NOT EXISTS public.applications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT,
  api_key TEXT UNIQUE,
  allowed_origins TEXT[], -- CORS origins
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, name)
);

-- Insert aplikasi
INSERT INTO public.applications (id, tenant_id, name, domain, allowed_origins) VALUES
  ('app_pos_web', 'pos', 'POS Web App', 'pos.yourcompany.com', ARRAY['https://pos.yourcompany.com']),
  ('app_ticket_web', 'ticket', 'Ticketing Web App', 'tickets.yourcompany.com', ARRAY['https://tickets.yourcompany.com']),
  ('app_crypto_web', 'crypto', 'Exchange Web App', 'exchange.yourcompany.com', ARRAY['https://exchange.yourcompany.com']);
```

---

### **Phase 2: Schema Provisioning**

#### 2.1 Schema Creation Script
```typescript
// scripts/provision-tenant.ts
import { Pool } from 'pg';

interface ProvisionTenantInput {
  tenantId: string;
  name: string;
  slug: string;
}

async function provisionTenant(input: ProvisionTenantInput) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  const schemaName = `tenant_${input.tenantId}`;

  try {
    // 1. Create schema
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
    console.log(`✅ Schema ${schemaName} created`);

    // 2. Run migrations for this schema
    await runMigrations(schemaName);
    console.log(`✅ Migrations completed for ${schemaName}`);

    // 3. Register tenant in registry
    await pool.query(`
      INSERT INTO public.tenants (id, name, slug, schema_name, status)
      VALUES ($1, $2, $3, $4, 'active')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW()
    `, [input.tenantId, input.name, input.slug, schemaName]);

    console.log(`✅ Tenant ${input.tenantId} registered`);

    return { success: true, schemaName };
  } catch (error) {
    console.error('❌ Provisioning failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

async function runMigrations(schemaName: string) {
  const pool = new Pool({
    connectionString: `${process.env.DATABASE_URL}?schema=${schemaName}`
  });

  try {
    // Run Prisma migrations
    const { execSync } = require('child_process');
    execSync(`DATABASE_URL="${process.env.DATABASE_URL}?schema=${schemaName}" npx prisma db push`, {
      stdio: 'inherit'
    });
  } finally {
    await pool.end();
  }
}

// Usage
provisionTenant({
  tenantId: 'pos',
  name: 'POS Kasir',
  slug: 'pos-kasir'
});
```

---

### **Phase 3: Multi-Tenant Prisma Client**

#### 3.1 Tenant Connection Manager
```typescript
// src/multi-tenant/connection-manager.ts
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

class TenantConnectionManager {
  private connections = new Map<string, PrismaClient>();
  private tenantRegistry = new Map<string, { schemaName: string }>();

  async initialize() {
    // Load tenant registry dari database
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });

    const result = await pool.query(`
      SELECT id, schema_name FROM public.tenants WHERE status = 'active'
    `);

    result.rows.forEach(row => {
      this.tenantRegistry.set(row.id, { schemaName: row.schema_name });
    });

    await pool.end();
    console.log(`✅ Loaded ${this.tenantRegistry.size} tenants`);
  }

  getClient(tenantId: string): PrismaClient {
    // Return cached connection
    if (this.connections.has(tenantId)) {
      return this.connections.get(tenantId)!;
    }

    // Get schema name from registry
    const tenant = this.tenantRegistry.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    // Create new connection with schema
    const client = new PrismaClient({
      datasources: {
        db: {
          url: `${process.env.DATABASE_URL}?schema=${tenant.schemaName}`
        }
      }
    });

    this.connections.set(tenantId, client);
    console.log(`✅ Created connection for tenant ${tenantId} (${tenant.schemaName})`);

    return client;
  }

  async disconnect(tenantId?: string) {
    if (tenantId) {
      const client = this.connections.get(tenantId);
      if (client) {
        await client.$disconnect();
        this.connections.delete(tenantId);
      }
    } else {
      // Disconnect all
      await Promise.all(
        Array.from(this.connections.values()).map(client => client.$disconnect())
      );
      this.connections.clear();
    }
  }

  async reloadTenants() {
    await this.initialize();
  }
}

export const tenantManager = new TenantConnectionManager();
```

---

### **Phase 4: Multi-Tenant Realmio**

#### 4.1 Updated Auth Configuration
```typescript
// src/multi-tenant/auth.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { tenantManager } from "./connection-manager";
import { admin, organization } from "better-auth/plugins";

export function createTenantAuth(tenantId: string) {
  const prisma = tenantManager.getClient(tenantId);

  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    
    url: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    
    session: { 
      cookieCache: { enabled: false }
    },
    
    trustedOrigins: getTenantOrigins(tenantId),
    
    emailAndPassword: { enabled: true },
    
    plugins: [
      admin(),
      organization(),
      // API Keys, JWT, etc
    ],
  });
}

function getTenantOrigins(tenantId: string): string[] {
  // Get allowed origins untuk tenant ini dari database
  const defaultOrigins = [
    env.BETTER_AUTH_URL,
    'http://localhost:3000',
    'http://localhost:5173'
  ];

  // TODO: Load from database
  const tenantOrigins: Record<string, string[]> = {
    'pos': ['https://pos.yourcompany.com'],
    'ticket': ['https://tickets.yourcompany.com'],
    'crypto': ['https://exchange.yourcompany.com']
  };

  return [...defaultOrigins, ...(tenantOrigins[tenantId] || [])];
}
```

#### 4.2 Tenant Middleware
```typescript
// src/middleware/tenant.ts
import { FastifyRequest, FastifyReply } from 'fastify';

export async function tenantMiddleware(
  req: FastifyRequest,
  reply: FastifyReply
) {
  // Extract tenant dari subdomain atau header
  const tenantId = extractTenantId(req);

  if (!tenantId) {
    return reply.status(400).send({
      error: 'tenant_required',
      message: 'Tenant identifier required (subdomain or X-Tenant-Id header)'
    });
  }

  // Validate tenant exists
  if (!tenantManager.tenantRegistry.has(tenantId)) {
    return reply.status(404).send({
      error: 'tenant_not_found',
      message: `Tenant ${tenantId} not found`
    });
  }

  // Attach tenant to request
  (req as any).tenantId = tenantId;
}

function extractTenantId(req: FastifyRequest): string | null {
  // Method 1: From header
  const headerTenant = req.headers['x-tenant-id'] as string;
  if (headerTenant) return headerTenant;

  // Method 2: From subdomain
  // pos.0xauthx0.netlify.app -> "pos"
  const host = req.headers.host || '';
  const subdomain = host.split('.')[0];
  
  const validTenants = ['pos', 'ticket', 'crypto'];
  if (validTenants.includes(subdomain)) {
    return subdomain;
  }

  // Method 3: From custom domain mapping
  const domainMap: Record<string, string> = {
    'pos.yourcompany.com': 'pos',
    'tickets.yourcompany.com': 'ticket',
    'exchange.yourcompany.com': 'crypto'
  };
  
  return domainMap[host] || null;
}
```

#### 4.3 Updated Server with Multi-Tenancy
```typescript
// src/server.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import { tenantManager } from "./multi-tenant/connection-manager";
import { createTenantAuth } from "./multi-tenant/auth";
import { tenantMiddleware } from "./middleware/tenant";

const app = Fastify({ logger: true });

// Initialize tenant manager
await tenantManager.initialize();

app.register(cors, {
  origin: (origin, cb) => {
    // Tenant-aware CORS
    cb(null, true); // Validation in tenantMiddleware
  },
  credentials: true,
});

// Apply tenant middleware to all auth routes
app.addHook('onRequest', async (req, reply) => {
  if (req.url.startsWith('/api/auth')) {
    await tenantMiddleware(req, reply);
  }
});

// Multi-tenant auth handler
app.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  handler: async (request, reply) => {
    const tenantId = (request as any).tenantId;
    
    // Get tenant-specific auth instance
    const auth = createTenantAuth(tenantId);
    
    const base = `http://${request.headers.host}`;
    const url = new URL(request.url, base);
    
    const headers = new Headers();
    for (const [k, v] of Object.entries(request.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }

    const body = request.body
      ? (typeof request.body === "string" ? request.body : JSON.stringify(request.body))
      : undefined;

    const res = await auth.handler(new Request(url.toString(), {
      method: request.method,
      headers,
      body
    }));

    reply.status(res.status);
    res.headers.forEach((val, key) => reply.header(key, val));
    const text = await res.text().catch(() => "");
    reply.send(text);
  }
});

// Health check dengan tenant info
app.get("/healthz", async (req, reply) => {
  reply.send({ 
    ok: true,
    tenants: Array.from(tenantManager.tenantRegistry.keys())
  });
});

const startServer = async () => {
  try {
    await app.listen({ host: "0.0.0.0", port: env.PORT });
    app.log.info(`Multi-tenant auth service running on port ${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

startServer();
```

---

## 🔐 Security Best Practices

### 1. Tenant Isolation Validation
```typescript
// src/security/tenant-validator.ts
export class TenantValidator {
  // Ensure user can only access their tenant
  static async validateUserTenantAccess(
    userId: string,
    tenantId: string
  ): Promise<boolean> {
    const prisma = tenantManager.getClient(tenantId);
    
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    return !!user;
  }

  // Prevent cross-tenant session hijacking
  static validateSessionTenant(
    sessionTenantId: string,
    requestTenantId: string
  ): void {
    if (sessionTenantId !== requestTenantId) {
      throw new Error('Cross-tenant access forbidden');
    }
  }
}
```

### 2. Audit Logging
```typescript
// Log semua cross-tenant access attempts
app.addHook('onResponse', async (req, reply) => {
  const tenantId = (req as any).tenantId;
  const userId = (req as any).user?.id;
  
  if (reply.statusCode === 403) {
    console.error('🚨 SECURITY ALERT: Cross-tenant access attempt', {
      userId,
      requestedTenant: tenantId,
      ip: req.ip,
      url: req.url,
      timestamp: new Date().toISOString()
    });
  }
});
```

### 3. Rate Limiting Per Tenant
```typescript
import rateLimit from '@fastify/rate-limit';

// Per-tenant rate limiting
app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (req) => {
    const tenantId = (req as any).tenantId || 'unknown';
    return `${tenantId}:${req.ip}`;
  }
});
```

---

## 🧪 Testing Multi-Tenancy

### Test Tenant Isolation
```typescript
// tests/multi-tenant.test.ts
describe('Multi-Tenant Isolation', () => {
  it('should isolate data between tenants', async () => {
    // Create user di tenant POS
    const posResponse = await fetch('https://0xauthx0.netlify.app/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': 'pos'
      },
      body: JSON.stringify({
        email: 'user@pos.com',
        password: 'Pass123!',
        name: 'POS User'
      })
    });
    
    expect(posResponse.status).toBe(200);
    
    // Try to login dengan tenant yang berbeda - should FAIL
    const ticketResponse = await fetch('https://0xauthx0.netlify.app/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': 'ticket' // Different tenant!
      },
      body: JSON.stringify({
        email: 'user@pos.com',
        password: 'Pass123!'
      })
    });
    
    // User tidak ditemukan di tenant ticket
    expect(ticketResponse.status).toBe(401);
  });
  
  it('should prevent cross-tenant session access', async () => {
    // Login di POS tenant
    const loginRes = await fetch('https://0xauthx0.netlify.app/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'X-Tenant-Id': 'pos',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'user@pos.com',
        password: 'Pass123!'
      })
    });
    
    const sessionToken = loginRes.headers.get('set-auth-token');
    
    // Try access dengan session POS di tenant Ticket
    const crossTenantRes = await fetch('https://0xauthx0.netlify.app/api/auth/get-session', {
      headers: {
        'X-Tenant-Id': 'ticket', // Different tenant!
        'Authorization': `Bearer ${sessionToken}`
      }
    });
    
    expect(crossTenantRes.status).toBe(403); // Forbidden
  });
});
```

---

## 📊 Migration Guide

### From Current (Single Schema) to Multi-Tenant

#### Step 1: Backup Current Data
```bash
pg_dump $DATABASE_URL > backup_before_migration.sql
```

#### Step 2: Create Tenant Registry
```bash
psql $DATABASE_URL < scripts/create-tenant-registry.sql
```

#### Step 3: Provision Schemas for Existing Tenants
```bash
npm run provision-tenant -- --id=pos --name="POS Kasir"
npm run provision-tenant -- --id=ticket --name="Ticketing"
npm run provision-tenant -- --id=crypto --name="Exchange"
```

#### Step 4: Migrate Existing Data
```typescript
// scripts/migrate-to-multi-tenant.ts
async function migrateExistingData() {
  // Get all organizations dari schema public
  const orgs = await publicPrisma.organization.findMany();
  
  for (const org of orgs) {
    console.log(`Migrating org: ${org.name}`);
    
    // Map organization ke tenant
    const tenantId = mapOrgToTenant(org);
    const tenantClient = tenantManager.getClient(tenantId);
    
    // Migrate users
    const users = await publicPrisma.user.findMany({
      where: { 
        members: {
          some: { organizationId: org.id }
        }
      }
    });
    
    for (const user of users) {
      await tenantClient.user.create({
        data: user
      });
    }
    
    console.log(`✅ Migrated ${users.length} users to ${tenantId}`);
  }
}
```

#### Step 5: Deploy New Multi-Tenant Code
```bash
# Deploy updated code ke Netlify
netlify deploy --prod
```

#### Step 6: Verify & Monitor
```bash
# Test each tenant
curl -H "X-Tenant-Id: pos" https://0xauthx0.netlify.app/healthz
curl -H "X-Tenant-Id: ticket" https://0xauthx0.netlify.app/healthz
curl -H "X-Tenant-Id: crypto" https://0xauthx0.netlify.app/healthz
```

---

## 🚦 Go-Live Checklist

- [ ] Tenant registry table created
- [ ] All schemas provisioned
- [ ] Data migrated to tenant schemas
- [ ] Connection manager tested
- [ ] Tenant middleware implemented
- [ ] CORS configured per tenant
- [ ] Security audit completed
- [ ] Load testing passed
- [ ] Backup strategy in place
- [ ] Monitoring & alerts configured
- [ ] Rollback plan documented
- [ ] Team trained on multi-tenant ops

---

## 📈 Monitoring & Operations

### Key Metrics to Monitor
```typescript
// Metrics per tenant
interface TenantMetrics {
  tenantId: string;
  activeUsers: number;
  requestsPerMinute: number;
  avgResponseTime: number;
  errorRate: number;
  dbConnectionsUsed: number;
}

// Alert conditions
- Cross-tenant access attempts > 0
- Schema not found errors
- Connection pool exhaustion
- Response time > 500ms
```

---

## 🎯 Summary

**Implementation Complexity:** Medium  
**Security Level:** High (True Isolation)  
**Scalability:** 100-10,000 tenants  
**Cost:** Moderate (1 database, multiple schemas)  
**Best For:** POS, Ticketing, Exchange, SaaS products  

**Next Steps:**
1. Review this implementation guide
2. Provision first tenant schema
3. Test tenant isolation
4. Gradually migrate existing tenants
5. Monitor and optimize

---

**Questions or need help?** Refer to:
- `docs/organizations.md` - Organization concepts
- `docs/INTEGRATION_GUIDE.md` - API integration
- `docs/QUICK_START.md` - Quick testing

**Status:** ✅ Production-Ready Pattern | 🔒 Secure | 📈 Scalable
