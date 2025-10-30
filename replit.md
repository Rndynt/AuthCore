# Auth Service - Better Auth

## Project Overview
Multi-tenant authentication service built with Better Auth and Fastify. The application provides a complete authentication solution with tenant isolation using PostgreSQL schema separation.

## Architecture
- **Backend**: Fastify server with Better Auth integration
- **Database**: PostgreSQL with multi-tenant schema isolation
- **Multi-Tenancy**: Shared database, separate schemas pattern
- **Deployment**: Configured for Replit autoscale deployment

## Recent Setup (Oct 30, 2025)
Successfully restored and initialized the multi-tenant authentication service:

### Database Initialization
- Created PostgreSQL database using Replit's built-in service
- Set up multi-tenant registry tables (tenants, applications, audit log)
- Provisioned tenant-specific schemas: `tenant_pos`, `tenant_ticket`, `tenant_crypto`
- Cloned Better Auth tables into each tenant schema for data isolation
- Fixed Prisma schema conflict by removing duplicate Tenant model

### Previous Setup (Sept 29, 2025)
Successfully migrated GitHub import to Replit environment with the following configurations:

### Environment Configuration
- Set up environment variables with development defaults for Replit
- Configured PostgreSQL database integration
- Fixed Prisma schema validation issues for Better Auth compatibility
- Set up Better Auth with proper CORS and trusted origins

### Database Setup
- Created PostgreSQL database using Replit's built-in service
- Generated Prisma client and pushed schema to database
- Fixed Account model schema conflicts between duplicate field definitions
- Configured Better Auth to work with Prisma adapter

### Development Server
- Auth service running on port 5000 with Fastify backend
- Multi-tenant Better Auth instances (one per tenant)
- API endpoints available at `/api/auth/*` with tenant identification required
- Three active tenants: `pos` (POS Kasir), `ticket` (Ticketing System), `crypto` (Crypto Exchange)
- Tenant identification via: X-Tenant-Id header, subdomain, or /tenant/{id} path prefix

### Key Technical Fixes
1. **Prisma Schema**: Cleaned up duplicate fields in Account model for Better Auth compatibility
2. **Environment Variables**: Configured for Replit with proper domain handling and trusted origins
3. **Database Integration**: Set up both Prisma (for Better Auth) and Drizzle (for additional operations)
4. **Authentication Flow**: Implemented email/password signup, signin, and session management

### Project Structure
- `src/`: Core authentication service (server.ts, auth.ts, env.ts)
- `prisma/`: Database schema and configuration for Better Auth
- `shared/`: Shared Drizzle schema definitions (separate from Better Auth)
- `netlify/`: Netlify Functions for production deployment (alternative)

### Development Workflow
- Run `npm run dev` to start auth service on port 5000
- Backend API endpoints available at `/api/auth/*` (requires tenant identification)
- Database operations via Prisma for Better Auth models (tenant-isolated)
- Tenant registry managed via raw SQL in `src/multi-tenant/schema.sql`
- Provision new tenant schemas with `npx tsx src/multi-tenant/provision-schemas.ts`

### Multi-Tenant Setup
1. Initialize database: `cat src/multi-tenant/schema.sql | psql $DATABASE_URL`
2. Create Better Auth tables: `npx prisma db push --accept-data-loss`
3. Provision tenant schemas: `npx tsx src/multi-tenant/provision-schemas.ts`
4. Start service: `npm run dev`

### Deployment
- Build: `npm run build` (compiles TypeScript to dist/)
- Start: `npm start` (runs production server from dist/)
- Target: Autoscale deployment for stateless authentication service
- Environment: Configured for Replit with PostgreSQL backend