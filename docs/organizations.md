# Organizations & Multi-Tenancy Guide

This guide covers implementing multi-tenant applications using AuthCore's organization system with role-based access control (RBAC).

## Overview

Organizations in AuthCore provide:
- **Multi-tenancy**: Isolated workspaces for different customers/teams
- **Role-based Access**: Owner, Admin, and Member roles with different permissions
- **Membership Management**: Invite, remove, and manage organization members
- **Context Passing**: Organization context flows to downstream services

## Core Concepts

### Organization
A tenant/workspace that contains users and resources. Each organization has:
- **Unique ID**: `org_1234567890abcdef`
- **Name**: Human-readable name ("Acme Corporation")
- **Slug**: URL-friendly identifier ("acme-corporation")
- **Metadata**: Optional custom data

### Roles
Three built-in roles with hierarchical permissions:

| Role | Permissions |
|------|------------|
| **Owner** | Full control: manage members, delete org, billing |
| **Admin** | Manage members, create resources, admin access |
| **Member** | Basic access to org resources |

### Membership
Represents a user's role within a specific organization:
```json
{
  "userId": "user_abc123",
  "organizationId": "org_def456", 
  "role": "admin",
  "joinedAt": "2025-01-01T00:00:00Z"
}
```

## Implementation Patterns

### 1. Organization Context Flow

```mermaid
graph LR
    A[Frontend] --> B[Auth Service]
    B --> C[API Gateway]
    C --> D[Orders Service]
    C --> E[Billing Service]
    C --> F[Analytics Service]
    
    A -.->|X-Org-Id: org_123| C
    C -.->|X-Org-Id: org_123| D
    C -.->|X-Org-Id: org_123| E
    C -.->|X-Org-Id: org_123| F
```

**Flow:**
1. Frontend determines current organization context
2. All API requests include `X-Org-Id: org_123` header
3. Services scope operations to the specified organization

### 2. Permission Checking

```typescript
// Example middleware for checking org permissions
export function requireOrgRole(requiredRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const orgId = req.headers['x-org-id'] as string
    const userId = req.user.id // From auth middleware
    
    if (!orgId) {
      return res.status(400).json({ error: 'Organization context required' })
    }

    // Get user's role in the organization
    const membership = await getUserOrgMembership(userId, orgId)
    
    if (!membership || !requiredRoles.includes(membership.role)) {
      return res.status(403).json({ error: 'Insufficient organization permissions' })
    }

    req.organization = { id: orgId, role: membership.role }
    next()
  }
}

// Usage
app.get('/admin/settings', 
  authenticateUser,
  requireOrgRole(['owner', 'admin']),
  (req, res) => {
    // Only owners and admins can access
  }
)
```

## Organization Management

### Creating Organizations

```bash
# Via DEV endpoint (requires authenticated user)
curl -i -c cookie.txt -b cookie.txt -X POST https://your-auth-service.com/dev/orgs \
  -H "Content-Type: application/json" \
  --data '{
    "name": "Acme Corporation"
  }'

# Response
{
  "org": {
    "id": "org_1234567890abcdef",
    "name": "Acme Corporation", 
    "slug": "acme-corporation",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

```typescript
// Programmatic creation
async function createOrganization(name: string) {
  const response = await auth.api.createOrganization({
    headers: getAuthHeaders(),
    body: {
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    }
  })
  return response
}
```

### Managing Members

#### Adding Members

```bash
# Add member via DEV endpoint
curl -i -c cookie.txt -b cookie.txt -X POST https://your-auth-service.com/dev/orgs/org_123/members \
  -H "Content-Type: application/json" \
  --data '{
    "email": "newmember@example.com",
    "role": "admin"
  }'
```

```typescript
// Programmatic member addition
async function addOrgMember(orgId: string, email: string, role: 'owner' | 'admin' | 'member') {
  const response = await auth.api.organizationInvite({
    headers: getAuthHeaders(),
    body: {
      organizationId: orgId,
      email,
      role
    }
  })
  return response
}
```

#### Updating Member Roles

```bash
# Update member role
curl -i -c cookie.txt -b cookie.txt -X PATCH https://your-auth-service.com/dev/orgs/org_123/members/user_456 \
  -H "Content-Type: application/json" \
  --data '{
    "role": "owner"
  }'
```

#### Listing Members

```bash
# List organization members
curl -i https://your-auth-service.com/dev/orgs/org_123/members
```

## Frontend Integration

### Organization Switcher Component

```typescript
// React organization switcher
import { useState, useEffect } from 'react'

interface Organization {
  id: string
  name: string
  role: string
}

export function OrganizationSwitcher() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [currentOrg, setCurrentOrg] = useState<string>('')

  useEffect(() => {
    // Fetch user's organization memberships
    fetchUserOrganizations()
  }, [])

  const fetchUserOrganizations = async () => {
    const response = await fetch('/auth/dev/whoami', {
      credentials: 'include'
    })
    const data = await response.json()
    setOrganizations(data.memberships || [])
    
    // Set current org from localStorage or first org
    const saved = localStorage.getItem('currentOrgId')
    setCurrentOrg(saved || data.memberships[0]?.id || '')
  }

  const switchOrganization = (orgId: string) => {
    setCurrentOrg(orgId)
    localStorage.setItem('currentOrgId', orgId)
    
    // Reload app with new organization context
    window.location.reload()
  }

  return (
    <select 
      value={currentOrg} 
      onChange={(e) => switchOrganization(e.target.value)}
    >
      {organizations.map(org => (
        <option key={org.id} value={org.id}>
          {org.name} ({org.role})
        </option>
      ))}
    </select>
  )
}
```

### API Client with Organization Context

```typescript
// API client that automatically includes org context
export class APIClient {
  private baseURL: string
  private currentOrgId: string | null = null

  constructor(baseURL: string) {
    this.baseURL = baseURL
    this.currentOrgId = localStorage.getItem('currentOrgId')
  }

  setOrganization(orgId: string) {
    this.currentOrgId = orgId
    localStorage.setItem('currentOrgId', orgId)
  }

  async request(endpoint: string, options: RequestInit = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    }

    // Add organization context if available
    if (this.currentOrgId) {
      headers['X-Org-Id'] = this.currentOrgId
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include'
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`)
    }

    return response.json()
  }

  // Organization-scoped API methods
  async getOrders() {
    return this.request('/orders')
  }

  async createInvoice(data: any) {
    return this.request('/invoices', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }
}

// Usage
const api = new APIClient('https://api.yourapp.com')
api.setOrganization('org_123')
const orders = await api.getOrders() // Scoped to org_123
```

## Backend Service Integration

### Organization-Scoped Database Models

```typescript
// Prisma schema example
model Order {
  id             String   @id @default(cuid())
  organizationId String   // Organization scope
  customerId     String
  amount         Decimal
  status         String
  createdAt      DateTime @default(now())
  
  organization   Organization @relation(fields: [organizationId], references: [id])
  
  @@index([organizationId])
  @@map("orders")
}

model Customer {
  id             String   @id @default(cuid())
  organizationId String   // Organization scope
  name           String
  email          String
  
  organization   Organization @relation(fields: [organizationId], references: [id])
  
  @@unique([organizationId, email]) // Unique per organization
  @@index([organizationId])
  @@map("customers")
}
```

### Service Layer with Organization Context

```typescript
// Service class with automatic organization scoping
export class OrderService {
  constructor(private db: PrismaClient) {}

  async getOrders(orgId: string, filters?: any) {
    return this.db.order.findMany({
      where: {
        organizationId: orgId,
        ...filters
      },
      include: {
        customer: true
      }
    })
  }

  async createOrder(orgId: string, data: CreateOrderData) {
    return this.db.order.create({
      data: {
        ...data,
        organizationId: orgId // Always scope to organization
      }
    })
  }

  async updateOrder(orgId: string, orderId: string, data: UpdateOrderData) {
    // Ensure order belongs to organization
    const order = await this.db.order.findFirst({
      where: { id: orderId, organizationId: orgId }
    })

    if (!order) {
      throw new Error('Order not found or access denied')
    }

    return this.db.order.update({
      where: { id: orderId },
      data
    })
  }
}

// Express middleware to inject org context
export function injectOrgContext() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const orgId = req.headers['x-org-id'] as string
    
    if (!orgId) {
      return res.status(400).json({ error: 'Organization context required' })
    }

    // Verify user has access to this organization
    const hasAccess = await verifyOrgAccess(req.user.id, orgId)
    if (!hasAccess) {
      return res.status(403).json({ error: 'Organization access denied' })
    }

    req.orgId = orgId
    next()
  }
}
```

## Multi-Tenant Data Patterns

### 1. Shared Database, Shared Schema (Row-Level Security)

```sql
-- All tables include organizationId
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  customer_name TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_orders_org_id ON orders(organization_id);

-- Row Level Security (RLS) for additional protection
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_org_isolation ON orders
  FOR ALL TO application_role
  USING (organization_id = current_setting('app.current_org_id')::UUID);
```

### 2. Shared Database, Separate Schemas

```typescript
// Dynamic schema selection based on organization
export class MultiTenantDB {
  constructor(private baseConnection: PrismaClient) {}

  getClient(orgId: string): PrismaClient {
    const schemaName = `org_${orgId.replace(/[^a-zA-Z0-9]/g, '')}`
    
    // Create new client with organization-specific schema
    return new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL + `&schema=${schemaName}`
        }
      }
    })
  }
}
```

### 3. Database Per Tenant

```typescript
// Separate database per organization
export class TenantDatabase {
  private connections = new Map<string, PrismaClient>()

  getConnection(orgId: string): PrismaClient {
    if (!this.connections.has(orgId)) {
      const dbUrl = this.getDatabaseURL(orgId)
      const client = new PrismaClient({ datasources: { db: { url: dbUrl } } })
      this.connections.set(orgId, client)
    }
    
    return this.connections.get(orgId)!
  }

  private getDatabaseURL(orgId: string): string {
    // Construct database URL for specific organization
    return `postgresql://user:pass@host:port/org_${orgId}?sslmode=require`
  }
}
```

## Security Considerations

### Organization Isolation

```typescript
// Always verify organization access
export async function verifyOrgAccess(userId: string, orgId: string): Promise<boolean> {
  const membership = await auth.api.getOrganizationMembership({
    userId,
    organizationId: orgId
  })
  
  return !!membership
}

// Middleware to enforce organization boundaries
export function enforceOrgBoundary() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { orgId } = req.params
    const headerOrgId = req.headers['x-org-id']
    
    // Ensure URL org matches header org
    if (orgId && headerOrgId && orgId !== headerOrgId) {
      return res.status(400).json({ error: 'Organization context mismatch' })
    }
    
    next()
  }
}
```

### Data Leakage Prevention

```typescript
// Repository pattern with built-in org scoping
export abstract class OrgScopedRepository<T> {
  protected orgId: string

  constructor(orgId: string, protected db: PrismaClient) {
    this.orgId = orgId
  }

  // All queries automatically include organization filter
  protected addOrgFilter(where: any) {
    return {
      ...where,
      organizationId: this.orgId
    }
  }

  async findMany(where?: any) {
    return this.db[this.tableName].findMany({
      where: this.addOrgFilter(where)
    })
  }

  async create(data: any) {
    return this.db[this.tableName].create({
      data: {
        ...data,
        organizationId: this.orgId
      }
    })
  }

  protected abstract get tableName(): string
}

// Usage
export class OrderRepository extends OrgScopedRepository<Order> {
  protected get tableName() { return 'order' }

  async findByStatus(status: string) {
    return this.findMany({ status }) // Automatically scoped to organization
  }
}
```

## Testing Multi-Tenancy

```typescript
// Test organization isolation
describe('Organization Isolation', () => {
  let org1: Organization
  let org2: Organization
  let user1: User
  let user2: User

  beforeEach(async () => {
    // Create test organizations and users
    org1 = await createTestOrg('Org 1')
    org2 = await createTestOrg('Org 2')
    user1 = await createTestUser('user1@example.com')
    user2 = await createTestUser('user2@example.com')
    
    // Add users to different organizations
    await addUserToOrg(user1.id, org1.id, 'admin')
    await addUserToOrg(user2.id, org2.id, 'admin')
  })

  it('should not allow cross-org data access', async () => {
    // User1 creates order in Org1
    const order = await createOrder(org1.id, { name: 'Test Order' })
    
    // User2 should not see Org1 order
    const response = await request(app)
      .get('/orders')
      .set('Authorization', `Bearer ${user2Token}`)
      .set('X-Org-Id', org2.id)
    
    expect(response.body).not.toContainEqual(
      expect.objectContaining({ id: order.id })
    )
  })

  it('should enforce organization context', async () => {
    const response = await request(app)
      .get('/orders')
      .set('Authorization', `Bearer ${user1Token}`)
      // Missing X-Org-Id header
    
    expect(response.status).toBe(400)
    expect(response.body.error).toContain('Organization context required')
  })
}
```

## Performance Optimization

### Database Indexing

```sql
-- Essential indexes for multi-tenant queries
CREATE INDEX idx_orders_org_created ON orders(organization_id, created_at DESC);
CREATE INDEX idx_customers_org_email ON customers(organization_id, email);
CREATE INDEX idx_sessions_org_user ON user_sessions(organization_id, user_id);

-- Partial indexes for active records
CREATE INDEX idx_orders_org_active ON orders(organization_id) 
  WHERE status IN ('pending', 'processing');
```

### Caching Strategies

```typescript
// Organization-scoped cache keys
export class OrgCache {
  constructor(private redis: Redis) {}

  private getKey(orgId: string, key: string): string {
    return `org:${orgId}:${key}`
  }

  async get<T>(orgId: string, key: string): Promise<T | null> {
    const data = await this.redis.get(this.getKey(orgId, key))
    return data ? JSON.parse(data) : null
  }

  async set(orgId: string, key: string, value: any, ttl = 3600): Promise<void> {
    await this.redis.setex(
      this.getKey(orgId, key), 
      ttl, 
      JSON.stringify(value)
    )
  }

  async invalidate(orgId: string, pattern: string): Promise<void> {
    const keys = await this.redis.keys(this.getKey(orgId, pattern))
    if (keys.length > 0) {
      await this.redis.del(...keys)
    }
  }
}
```

## Monitoring & Analytics

```typescript
// Organization-scoped metrics
export class OrgMetrics {
  constructor(private metrics: MetricsClient) {}

  recordAPICall(orgId: string, endpoint: string, duration: number) {
    this.metrics.histogram('api_duration', duration, {
      org_id: orgId,
      endpoint
    })
  }

  recordUserAction(orgId: string, userId: string, action: string) {
    this.metrics.increment('user_actions', {
      org_id: orgId,
      user_id: userId,
      action
    })
  }
}

// Usage in middleware
app.use('/api', (req, res, next) => {
  const start = Date.now()
  
  res.on('finish', () => {
    const duration = Date.now() - start
    metrics.recordAPICall(req.orgId, req.path, duration)
  })
  
  next()
})
```