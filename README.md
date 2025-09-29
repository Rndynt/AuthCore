# Auth Service (Fastify + better-auth) with Prisma Postgres and Netlify Functions

Capabilities:
- Email/password login
- Admin and Organization (RBAC) plugins
- API Key for service-to-service (x-api-key creates mock session)
- JWT (+JWKS) for offline verification (polyglot services)
- CORS credentials + trustedOrigins
- Local Fastify dev server; production via Netlify Functions

## Environment
Copy .env.example to .env for local dev and set:
- BETTER_AUTH_URL=http://localhost:4000 (local) or your Netlify URL in prod
- BETTER_AUTH_SECRET=<long random string>
- TRUSTED_ORIGINS=https://your-frontend-domain,http://localhost:3000
- DATABASE_URL=postgresql connection string

## Database
pnpm prisma:gen
pnpm better-auth:gen
pnpm prisma:migrate
pnpm prisma:gen

## Run locally
pnpm dev
Visit http://localhost:4000/api/auth/session

## Smoke tests (local)
Sign-up:
curl -i -c cookie.txt -b cookie.txt -X POST http://localhost:4000/api/auth/sign-up/email -H "Content-Type: application/json" --data '{"email":"demo@example.com","password":"Passw0rd!"}'
Sign-in:
curl -i -c cookie.txt -b cookie.txt -X POST http://localhost:4000/api/auth/sign-in/email -H "Content-Type: application/json" --data '{"email":"demo@example.com","password":"Passw0rd!"}'
Get session:
curl -i -c cookie.txt -b cookie.txt http://localhost:4000/api/auth/session

## Service-to-service
- Create a dedicated "service user" and generate an API key via Admin/API.
- Call protected routes with header: x-api-key: <key>.
- For polyglot services use JWT and validate against JWKS exposed by the JWT plugin.

## Netlify
- netlify.toml already redirects /api/auth/* to the function "auth".
- Set Environment Variables in Netlify UI:
  - BETTER_AUTH_URL=https://<your-netlify-site>.netlify.app
  - BETTER_AUTH_SECRET=<long random>
  - TRUSTED_ORIGINS=https://<your-frontend-domain>,http://localhost:3000
  - DATABASE_URL=postgres (Netlify Postgres or external managed)
- Deploy via connected repo; ensure "pnpm prisma:deploy" runs on build (Netlify will run build; you can add a postbuild hook or rely on prisma generate/deploy in build pipeline).

## Notes
- For multiple cookies, Netlify requires multiValueHeaders; using session.cookieCache=false keeps it to a single cookie by default.
- Frontends must send credentials: 'include' and be listed in TRUSTED_ORIGINS.
- This service is framework-agnostic for consumers: Next.js/React/Node/Go can consume APIs and JWTs.

## DEV QA Endpoints

**⚠️ WARNING: Do NOT enable in production!**

Enable comprehensive QA endpoints for testing JWT, Bearer tokens, API Keys, Admin functionality, and Organization management by setting:

```bash
ENABLE_DEV_ENDPOINTS=true
```

### Authentication Methods

All `/dev/*` endpoints support three authentication methods:
- **Cookie**: Session-based (from sign-in)
- **API Key**: Header `x-api-key: <key>`
- **Bearer Token**: Header `Authorization: Bearer <jwt>`

### Available Endpoints

#### Identity & Status
- `GET /dev/whoami` - Current user identity, auth method, and organization memberships

#### API Key Management
- `POST /dev/api-keys` - Create API key (admin or self)
- `GET /dev/api-keys?userId=...` - List API keys (admin or owner)
- `DELETE /dev/api-keys/:keyId` - Revoke API key (admin or owner)

#### JWT & Bearer Tokens
- `POST /dev/jwt/issue` - Issue short-lived JWT token
- `GET /dev/jwks.json` - JWKS for JWT verification

#### Organization (Multi-tenant)
- `POST /dev/orgs` - Create organization
- `POST /dev/orgs/:orgId/members` - Add member by email
- `PATCH /dev/orgs/:orgId/members/:userId` - Update member role
- `GET /dev/orgs/:orgId/members` - List organization members

#### Admin
- `GET /dev/admin/users?limit=50` - List users (admin only)
- `POST /dev/admin/impersonate` - Impersonate user (DEV ONLY)

### Usage Examples

Replace `BASE` with:
- **Replit**: `https://c25f0f2e-887e-4494-845b-803084ff23ee-00-2rxeabtep8sj0.janeway.replit.dev`
- **Netlify**: `https://transity-auth.netlify.app`

#### Authentication Examples

**WHOAMI (cookie)**
```bash
curl -i -c cookie.txt -b cookie.txt BASE/dev/whoami
```

**WHOAMI (API key)**
```bash
curl -i -H "x-api-key: REPLACE_KEY" BASE/dev/whoami
```

**WHOAMI (Bearer token)**
```bash
curl -i -H "Authorization: Bearer REPLACE_JWT" BASE/dev/whoami
```

#### API Key Management

**Create API Key**
```bash
curl -i -c cookie.txt -b cookie.txt -X POST BASE/dev/api-keys \
  -H "Content-Type: application/json" \
  --data '{"label":"orders-svc","expiresInDays":90}'
```

**List API Keys**
```bash
curl -i -c cookie.txt -b cookie.txt BASE/dev/api-keys
```

**Revoke API Key**
```bash
curl -i -c cookie.txt -b cookie.txt -X DELETE BASE/dev/api-keys/REPLACE_KEY_ID
```

#### JWT & Bearer

**Issue JWT Token**
```bash
curl -i -c cookie.txt -b cookie.txt -X POST BASE/dev/jwt/issue \
  -H "Content-Type: application/json" \
  --data '{"ttlSeconds":1800,"audience":"orders-api","scopes":["orders:read"]}'
```

**Get JWKS**
```bash
curl -s BASE/dev/jwks.json
```

#### Organization Management

**Create Organization**
```bash
curl -i -c cookie.txt -b cookie.txt -X POST BASE/dev/orgs \
  -H "Content-Type: application/json" \
  --data '{"name":"Acme Corp"}'
```

**Add Member**
```bash
curl -i -c cookie.txt -b cookie.txt -X POST BASE/dev/orgs/REPLACE_ORG_ID/members \
  -H "Content-Type: application/json" \
  --data '{"email":"member@example.com","role":"admin"}'
```

**Update Member Role**
```bash
curl -i -c cookie.txt -b cookie.txt -X PATCH BASE/dev/orgs/REPLACE_ORG_ID/members/REPLACE_USER_ID \
  -H "Content-Type: application/json" \
  --data '{"role":"owner"}'
```

**List Members**
```bash
curl -i BASE/dev/orgs/REPLACE_ORG_ID/members
```

#### Admin Functions

**List Users**
```bash
curl -i -c cookie.txt -b cookie.txt BASE/dev/admin/users?limit=50
```

**Impersonate User (DEV ONLY)**
```bash
# Return JWT token
curl -i -c cookie.txt -b cookie.txt -X POST BASE/dev/admin/impersonate \
  -H "Content-Type: application/json" \
  --data '{"userId":"REPLACE_USER_ID","as":"jwt"}'

# Set session cookie
curl -i -c cookie.txt -b cookie.txt -X POST BASE/dev/admin/impersonate \
  -H "Content-Type: application/json" \
  --data '{"userId":"REPLACE_USER_ID","as":"cookie"}'
```

### Consuming from Microservices

**API Key Authentication**
```bash
curl -H "x-api-key: your-api-key" https://your-service/protected-endpoint
```

**Bearer Token Authentication**
```bash
curl -H "Authorization: Bearer your-jwt-token" https://your-service/protected-endpoint
```

**JWT Verification**
Use the JWKS endpoint (`/dev/jwks.json`) to verify JWT tokens in your services:
```typescript
import { jwtVerify, createRemoteJWKSet } from 'jose'

const JWKS = createRemoteJWKSet(new URL('https://your-auth-service/dev/jwks.json'))
const { payload } = await jwtVerify(token, JWKS)
```

### Smoke Tests

Run predefined smoke tests:
```bash
# Basic auth flow
npm run smoke:signup
npm run smoke:signin
npm run smoke:session

# Dev endpoints (requires ENABLE_DEV_ENDPOINTS=true)
npm run smoke:dev:whoami:replit
npm run smoke:dev:apikey:create:replit
npm run smoke:dev:jwt:issue:replit
npm run smoke:dev:org:create:replit
```