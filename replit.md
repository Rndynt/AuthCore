# Auth Service - Better Auth

## Project Overview
Full-stack authentication service built with Better Auth, Fastify, React, and Vite. The application provides a complete authentication solution with both frontend and backend components running on a single server.

## Architecture
- **Backend**: Fastify server with Better Auth integration
- **Frontend**: React application with Vite for development
- **Database**: PostgreSQL with Drizzle ORM
- **Deployment**: Configured for Replit autoscale deployment

## Recent Setup (Sept 28, 2025)
Successfully migrated GitHub import to Replit environment with the following configurations:

### Environment Configuration
- Set up environment variables with development defaults for Replit
- Configured PostgreSQL database integration
- Fixed Prisma schema validation issues
- Set up Better Auth with proper CORS and trusted origins

### Development Server
- Fixed Fastify + Vite integration for development mode
- Configured proper middleware routing for Vite assets
- Set up HMR (Hot Module Replacement) support
- Frontend serving on port 5000 with webview output

### Key Technical Fixes
1. **Vite Middleware Integration**: Adapted Express-based Vite setup to work with Fastify
2. **Asset Routing**: Fixed MIME type issues for JavaScript modules by properly routing Vite-specific URLs
3. **Environment Variables**: Created flexible env configuration that works in Replit with defaults
4. **Database Schema**: Fixed Prisma relation issues between Organization and Member models

### Project Structure
- `server/`: Backend Fastify server and Vite integration
- `client/`: React frontend application
- `shared/`: Shared schema definitions and types
- `src/`: Core authentication and environment configuration
- `prisma/`: Database schema and configuration

### Development Workflow
- Run `npm run dev` to start development server
- Frontend accessible via Replit webview on port 5000
- Backend API endpoints available at `/api/auth/*`
- Database operations via Drizzle ORM with `npm run db:push`

### Deployment
- Build: `npm run build` (builds both frontend and backend)
- Start: `npm run start` (production server)
- Target: Autoscale deployment for stateless web application