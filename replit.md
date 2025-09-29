# Auth Service - Better Auth

## Project Overview
Full-stack authentication service built with Better Auth, Fastify, React, and Vite. The application provides a complete authentication solution with both frontend and backend components running on a single server.

## Architecture
- **Backend**: Fastify server with Better Auth integration
- **Frontend**: React application with Vite for development
- **Database**: PostgreSQL with Drizzle ORM
- **Deployment**: Configured for Replit autoscale deployment

## Recent Setup (Sept 29, 2025)
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
- Better Auth integration for email/password authentication
- API endpoints available at `/api/auth/*` for authentication operations
- Health check endpoint at `/healthz` and session info at `/me`

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
- Backend API endpoints available at `/api/auth/*`
- Database operations via Prisma for Better Auth models
- Additional database operations via Drizzle ORM with `npm run db:push`

### Deployment
- Build: `npm run build` (compiles TypeScript to dist/)
- Start: `npm start` (runs production server from dist/)
- Target: Autoscale deployment for stateless authentication service
- Environment: Configured for Replit with PostgreSQL backend