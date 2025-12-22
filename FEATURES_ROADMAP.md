# AuthCore Multi-Tenant - Features Roadmap

Dokumentasi komprehensif untuk fitur yang sudah ada, yang belum ada, dan rekomendasi improvement untuk sistem AuthCore.

## 📊 Status: Features Summary

### ✅ Completed Features (Already in Database & UI)

#### Core Authentication
- ✅ Email/Password signup & login
- ✅ Session management
- ✅ User account management
- ✅ Admin authentication (authcore_system schema)
- ✅ Verification tokens

#### Multi-Tenant Management
- ✅ Tenant registry (3 tenants: POS, Ticketing, Crypto)
- ✅ Tenant-isolated schemas (complete schema isolation per tenant)
- ✅ Tenant CRUD API endpoints (create, read, list, delete, suspend, activate)
- ✅ Tenant metrics & monitoring

#### Admin Dashboard Pages
- ✅ Login page (`/login`)
- ✅ Dashboard overview (`/`)
- ✅ Tenants management (`/tenants`)
- ✅ Users search & management (`/users`)
- ✅ Support sessions management
- ✅ Security settings (`/security`)
- ✅ Audit logs (`/audit`)
- ✅ Live monitoring (`/monitoring`)

#### Admin Features
- ✅ User search across all tenants
- ✅ Session revocation
- ✅ Support sessions (impersonation)
- ✅ Audit logging (admin actions tracked)
- ✅ Security settings management
- ✅ Connection pool management
- ✅ Real-time monitoring

#### Database Models (In Prisma Schema)
- ✅ User model
- ✅ Account model (OAuth ready)
- ✅ Session model
- ✅ Organization model
- ✅ OrganizationMember model
- ✅ Member model
- ✅ Invitation model
- ✅ ApiKey model
- ✅ Verification models
- ✅ VerificationToken model

---

## ❌ Incomplete Features (Database Exists, UI Missing)

### 1. Organizations Management UI (HIGH PRIORITY)

**Status:** Database & API ready, **NO UI PAGE**

**Database Models:**
- ✅ Organization
- ✅ OrganizationMember (with roles: admin, member, viewer)
- ✅ Invitation

**Current Gap:** No `/organizations` page in admin UI

**What Needs to Be Built:**
```
/admin/organizations/page.tsx
├── List all organizations
├── Create organization (dialog/form)
├── Edit organization (name, description, logo, metadata)
├── View organization details
├── Manage organization members
│   ├── Add member
│   ├── Update member role
│   └── Remove member
├── Manage invitations
│   ├── Send invitation
│   ├── Resend invitation
│   └── Revoke invitation
└── Delete organization

API Endpoints to Create:
POST   /admin/api/organizations - create
GET    /admin/api/organizations - list
GET    /admin/api/organizations/:id - get
PUT    /admin/api/organizations/:id - update
DELETE /admin/api/organizations/:id - delete
POST   /admin/api/organizations/:id/members - add member
PUT    /admin/api/organizations/:id/members/:memberId - update role
DELETE /admin/api/organizations/:id/members/:memberId - remove
POST   /admin/api/organizations/:id/invitations - send invite
GET    /admin/api/organizations/:id/invitations - list invites
```

**Implementation Priority:** 🔴 CRITICAL (HIGH VALUE)

**Estimated Effort:** 4-6 hours

---

### 2. Role-Based Access Control (RBAC) - Partial

**Status:** Database models exist, UI partially implemented

**What Exists:**
- ✅ User.role field
- ✅ OrganizationMember.role field (admin, member, viewer)
- ✅ Member.role field

**What's Missing:**
- ❌ Permission matrix UI
- ❌ Fine-grained role definitions
- ❌ Role assignment per tenant
- ❌ Permission checking in API endpoints
- ❌ UI for managing roles & permissions

**What Needs to Be Built:**
```
/admin/roles-and-permissions/page.tsx
├── List all roles
├── Create custom role
├── Define permissions per role:
│   ├── users (read, create, update, delete)
│   ├── organizations (read, create, update, delete)
│   ├── tenants (read, list)
│   ├── security (read, update)
│   └── audit (read)
├── Assign roles to users
├── Assign roles to organization members
└── Preview permissions

API Changes Needed:
- Add permission checking middleware to admin API
- Extend User model with permissions field
```

**Implementation Priority:** 🟡 HIGH (Important for security)

**Estimated Effort:** 6-8 hours

---

## 🔧 Features to Add (Database Ready, Need UI)

### 3. API Keys Management

**Status:** ApiKey model exists in schema, **NO UI**

**Database Model:**
```typescript
model ApiKey {
  id         String
  name       String
  key        String @unique
  userId     String
  expiresAt  DateTime?
  permissions Json?
  createdAt  DateTime
  updatedAt  DateTime
}
```

**What Needs to Be Built:**
```
/admin/api-keys/page.tsx
├── List all API keys
├── Create new API key
├── View key details (masked)
├── Rotate/regenerate key
├── Set expiration date
├── Set permissions
├── Revoke key
└── Delete key

/admin/users/:userId/api-keys/page.tsx (per-user API keys)
├── User's API keys
├── Create, rotate, revoke
```

**Implementation Priority:** 🟡 HIGH (For integrations)

**Estimated Effort:** 3-4 hours

---

### 4. Email Verification & Password Reset

**Status:** Models exist (VerificationToken), **NO FLOW**

**What Needs:**
- ✅ Email verification on signup
- ✅ Resend verification email
- ✅ Password reset flow
- ✅ Email templates (HTML)
- ✅ Email service integration (SendGrid, Resend, etc)
- ❌ UI for password reset page
- ❌ Email sending implementation

**Implementation Priority:** 🟡 HIGH (Core UX)

**Estimated Effort:** 4-6 hours (including email service)

---

## 💡 New Features to Add (Not in Database Yet)

### 5. Two-Factor Authentication (2FA)

**Status:** Not implemented, **NEEDS DATABASE + UI**

**What Needs:**
- Database migration for 2FA settings
- TOTP (Time-based One-Time Password) setup
- Backup codes generation
- 2FA UI page for users
- Admin enforcement (enforce 2FA for all users)
- Login flow with 2FA verification

**Implementation Priority:** 🔴 CRITICAL (For security)

**Estimated Effort:** 8-10 hours

---

### 6. Webhook Integration & Notifications

**Status:** Not implemented, **NEEDS DATABASE + IMPLEMENTATION**

**What Needs:**
- Webhook registry per tenant
- Event system (user.created, user.deleted, organization.created, etc)
- Webhook delivery & retry logic
- Webhook testing UI
- Webhook logs & monitoring
- Event filtering per webhook

**Example Events:**
```
Events:
- user.created
- user.updated
- user.deleted
- user.banned
- organization.created
- organization.updated
- organization.deleted
- member.added
- member.removed
- invitation.sent
- session.created
- session.revoked
- tenant.created
- tenant.suspended
- tenant.activated
```

**Implementation Priority:** 🟡 MEDIUM (For integrations)

**Estimated Effort:** 8-12 hours

---

### 7. Email Templates & Notifications

**Status:** Not implemented, **NEEDS IMPLEMENTATION**

**Templates Needed:**
- Welcome email
- Email verification
- Password reset
- Organization invitation
- User invitation
- 2FA setup
- Admin alert (suspicious activity)
- Tenant activation/suspension

**Implementation Priority:** 🟡 MEDIUM

**Estimated Effort:** 4-6 hours

---

### 8. Activity/Session History per User

**Status:** Basic session tracking exists, **NEEDS UI**

**What Needs:**
- Session history page (where user logged in, IP, device, browser)
- Active sessions management (revoke sessions)
- Login history
- Activity timeline
- Device fingerprinting
- Geolocation tracking (optional)

**UI Page:**
```
/admin/users/:userId/sessions/page.tsx
├── Active sessions list
├── Session details (IP, User-Agent, location)
├── Revoke session button
└── Session history (last 30 days)
```

**Implementation Priority:** 🟡 MEDIUM (For security insights)

**Estimated Effort:** 3-4 hours

---

### 9. Rate Limiting & DDoS Protection

**Status:** Not implemented, **NEEDS BACKEND**

**What Needs:**
- Rate limiting per endpoint
- Per-user rate limiting
- Per-IP rate limiting
- Configurable limits per tenant
- Rate limit metrics & monitoring
- Admin control panel for rate limit settings

**Implementation Priority:** 🟡 MEDIUM (For stability)

**Estimated Effort:** 4-6 hours

---

### 10. OAuth Providers (Google, GitHub, etc)

**Status:** Account model ready for OAuth, **NEEDS IMPLEMENTATION**

**What Needs:**
- OAuth provider setup (Google, GitHub, Microsoft, Discord)
- Account linking
- OAuth signup/login flow
- Admin UI for configuring OAuth providers
- Per-tenant OAuth settings

**Implementation Priority:** 🟡 MEDIUM (For UX improvement)

**Estimated Effort:** 6-8 hours

---

### 11. Backup & Restore

**Status:** Not implemented, **NEEDS IMPLEMENTATION**

**What Needs:**
- Automated backup scheduling
- Manual backup trigger
- Backup history & list
- Restore functionality
- Backup encryption
- Backup verification
- Admin UI for backup management

**Implementation Priority:** 🔴 CRITICAL (For reliability)

**Estimated Effort:** 6-8 hours

---

### 12. Settings & Configuration Management

**Status:** Basic security settings exist, **NEEDS EXPANSION**

**What Needs:**
```
/admin/settings/page.tsx
├── General Settings
│   ├── System name
│   ├── Description
│   ├── Logo/branding
│   └── Time zone
├── Email Settings
│   ├── SMTP configuration
│   ├── Email templates
│   └── Test email
├── Security Settings (existing)
│   ├── Password policy
│   ├── Session timeout
│   ├── 2FA enforcement
│   ├── IP whitelist
│   └── API rate limits
├── Integrations
│   ├── Email service (SendGrid, Resend)
│   ├── OAuth providers
│   ├── Webhook endpoints
│   └── External services
├── Backup & Restore
│   ├── Backup schedule
│   ├── Backup history
│   └── Restore options
└── System Health
    ├── Database status
    ├── Cache status
    └── Dependencies check
```

**Implementation Priority:** 🟡 MEDIUM

**Estimated Effort:** 5-7 hours

---

### 13. Analytics & Reporting

**Status:** Not implemented, **NEEDS IMPLEMENTATION**

**What Needs:**
```
/admin/analytics/page.tsx
├── Dashboard metrics
│   ├── Total users per tenant
│   ├── Active sessions
│   ├── User growth chart
│   ├── Signup sources
│   └── Login frequency
├── Tenant metrics
│   ├── Usage by tenant
│   ├── API call volume
│   ├── Error rates
│   └── Performance metrics
├── Security metrics
│   ├── Failed login attempts
│   ├── Suspicious activities
│   ├── Bot detection
│   └── Geo-distribution of logins
└── Custom reports
    ├── Export data (CSV, JSON)
    ├── Scheduled reports
    └── Report templates
```

**Implementation Priority:** 🟡 MEDIUM (For insights)

**Estimated Effort:** 8-10 hours

---

### 14. User Batching & Bulk Operations

**Status:** Not implemented

**What Needs:**
- Bulk user import (CSV)
- Bulk user export
- Bulk invite users to organization
- Bulk role assignment
- Bulk user deletion
- Bulk ban/unban

**Implementation Priority:** 🟢 LOW (Nice to have)

**Estimated Effort:** 4-6 hours

---

### 15. Custom Fields & Metadata

**Status:** Metadata field exists in Organization, **NEEDS EXPANSION**

**What Needs:**
- Custom fields per tenant
- Dynamic field schema
- Custom fields in user profile
- Custom fields in organization
- Custom fields validation
- Admin UI for managing custom fields

**Implementation Priority:** 🟢 LOW (Advanced feature)

**Estimated Effort:** 6-8 hours

---

## 🎯 Implementation Roadmap (Recommended Priority)

### Phase 1: Critical Foundation (Weeks 1-2)
1. **Organizations Management UI** 🔴 (4-6 hours)
   - Full CRUD for organizations
   - Member management
   - Invitation system
   
2. **Two-Factor Authentication (2FA)** 🔴 (8-10 hours)
   - TOTP setup
   - Backup codes
   - Enforce 2FA for admins

3. **Email Verification & Password Reset** 🔴 (4-6 hours)
   - Integration with email service
   - Email templates
   - Verification flow

### Phase 2: Security & Monitoring (Weeks 2-3)
4. **Fine-Grained RBAC** 🟡 (6-8 hours)
   - Permission matrix
   - Custom roles
   - Tenant-level permissions

5. **Session & Activity History** 🟡 (3-4 hours)
   - Login history UI
   - Active sessions management
   - Device tracking

6. **Rate Limiting & DDoS Protection** 🟡 (4-6 hours)
   - Endpoint-based limits
   - Configurable per tenant

### Phase 3: Integration & Features (Weeks 3-4)
7. **API Keys Management UI** 🟡 (3-4 hours)
   - Key generation & rotation
   - Permission scoping

8. **Webhook Integration** 🟡 (8-12 hours)
   - Event system
   - Webhook delivery & retry
   - Testing UI

9. **OAuth Providers** 🟡 (6-8 hours)
   - Google, GitHub, Microsoft
   - Account linking

### Phase 4: Operations & Analytics (Weeks 4-5)
10. **Backup & Restore** 🔴 (6-8 hours)
    - Automated scheduling
    - Restore functionality

11. **Analytics & Reporting** 🟡 (8-10 hours)
    - Dashboard metrics
    - Custom reports
    - Export functionality

12. **Settings Management** 🟡 (5-7 hours)
    - Email configuration
    - Security policies
    - Integration settings

### Phase 5: Advanced Features (Week 5+)
13. **Bulk Operations** 🟢 (4-6 hours)
14. **Custom Fields** 🟢 (6-8 hours)
15. **Email Templates UI** 🟢 (4-6 hours)

---

## 📋 Implementation Checklist: Organizations (First Priority)

Since Organizations are critical and database-ready, here's detailed implementation guide:

### Step 1: API Endpoints (Backend)

**Create in `src/admin/admin-api.ts`:**

```typescript
// List organizations
if (resource[0] === "organizations" && method === "GET") {
  const organizations = await db.organization.findMany();
  return jsonResponse({ organizations });
}

// Create organization
if (resource[0] === "organizations" && method === "POST") {
  const body = await parseJsonBody(request);
  const organization = await db.organization.create({
    data: {
      name: body.name,
      slug: body.slug,
      description: body.description,
      logo: body.logo,
      metadata: body.metadata,
    },
  });
  await deps.tenantService.logAuditAction(...);
  return jsonResponse({ organization });
}

// Get organization
if (resource[0] === "organizations" && resource[1]) {
  const organization = await db.organization.findUnique({
    where: { id: resource[1] },
    include: {
      organizationMembers: {
        include: { user: true },
      },
      invitations: true,
    },
  });
  return jsonResponse({ organization });
}

// Update organization
if (resource[0] === "organizations" && resource[1] && method === "PUT") {
  const body = await parseJsonBody(request);
  const organization = await db.organization.update({
    where: { id: resource[1] },
    data: body,
  });
  return jsonResponse({ organization });
}

// Delete organization
if (resource[0] === "organizations" && resource[1] && method === "DELETE") {
  await db.organization.delete({ where: { id: resource[1] } });
  return jsonResponse({ success: true });
}

// Member management endpoints...
// Invitation endpoints...
```

### Step 2: UI Page

**Create `admin-ui/app/(dashboard)/organizations/page.tsx`:**

```typescript
// List view with:
// - Search/filter
// - Create organization button
// - Edit organization
// - Delete organization
// - View members
// - Manage invitations
// - Organization details sheet
```

**Create components:**
- `CreateOrganizationDialog.tsx`
- `OrganizationDetailsSheet.tsx`
- `MembersManagementDialog.tsx`
- `InvitationsDialog.tsx`

### Step 3: API Client

**Update `admin-ui/lib/api-client.ts`:**

```typescript
// Organization methods
getOrganizations()
createOrganization(data)
getOrganization(id)
updateOrganization(id, data)
deleteOrganization(id)

// Member methods
addMember(orgId, email, role)
updateMemberRole(orgId, memberId, role)
removeMember(orgId, memberId)

// Invitation methods
sendInvitation(orgId, email, role)
resendInvitation(orgId, invitationId)
revokeInvitation(orgId, invitationId)
```

---

## 🔗 Additional Notes

### Technology Stack (Already Configured)
- ✅ Fastify (Backend)
- ✅ Prisma (ORM)
- ✅ Next.js (Admin UI)
- ✅ TypeScript
- ✅ PostgreSQL (Multi-tenant)
- ✅ Better Auth (Auth library)

### Database Already Supports
- ✅ Multi-tenant schema isolation
- ✅ Audit logging
- ✅ OAuth accounts
- ✅ Sessions & verification tokens
- ✅ Organizations & RBAC
- ✅ API keys
- ✅ Custom invitations

### Quick Wins (Easy to Implement)
1. Organizations UI (4-6 hours) - High value
2. API Keys UI (3-4 hours) - Medium value
3. Session History UI (3-4 hours) - Medium value
4. Settings page expansion (5-7 hours) - Medium value

---

## 📞 Support & Resources

- Better Auth Docs: https://www.better-auth.com/
- Prisma Docs: https://www.prisma.io/docs/
- Fastify Docs: https://www.fastify.io/
- Next.js Docs: https://nextjs.org/docs

---

**Last Updated:** December 22, 2025
**Version:** 1.0

---

## Quick Links

| Feature | Status | Effort | Priority | Documentation |
|---------|--------|--------|----------|---|
| Organizations UI | ❌ Missing | 4-6h | 🔴 CRITICAL | See Phase 1 |
| 2FA | ❌ Missing | 8-10h | 🔴 CRITICAL | See Phase 1 |
| Email Verification | ⚠️ Partial | 4-6h | 🔴 CRITICAL | See Phase 1 |
| RBAC | ⚠️ Partial | 6-8h | 🟡 HIGH | See Phase 2 |
| API Keys UI | ⚠️ Partial | 3-4h | 🟡 HIGH | See Phase 2 |
| Webhooks | ❌ Missing | 8-12h | 🟡 MEDIUM | See Phase 3 |
| OAuth Providers | ❌ Missing | 6-8h | 🟡 MEDIUM | See Phase 3 |
| Backup & Restore | ❌ Missing | 6-8h | 🔴 CRITICAL | See Phase 4 |
| Analytics | ❌ Missing | 8-10h | 🟡 MEDIUM | See Phase 4 |
| Rate Limiting | ❌ Missing | 4-6h | 🟡 MEDIUM | See Phase 2 |
| Bulk Operations | ❌ Missing | 4-6h | 🟢 LOW | See Phase 5 |
| Custom Fields | ❌ Missing | 6-8h | 🟢 LOW | See Phase 5 |
