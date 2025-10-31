-- Create admin auth tables in authcore_system schema
SET search_path TO authcore_system, public;

-- Create users table
CREATE TABLE IF NOT EXISTS authcore_system.users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT UNIQUE NOT NULL,
  "emailVerified" BOOLEAN DEFAULT false,
  name TEXT,
  image TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  role TEXT,
  banned BOOLEAN DEFAULT false,
  "banReason" TEXT,
  "banExpires" TIMESTAMPTZ
);

-- Create accounts table
CREATE TABLE IF NOT EXISTS authcore_system.accounts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY ("user_id") REFERENCES authcore_system.users(id) ON DELETE CASCADE
);

-- Create sessions table
CREATE TABLE IF NOT EXISTS authcore_system.sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  token TEXT UNIQUE NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "user_id" TEXT NOT NULL,
  "impersonatedBy" TEXT,
  "activeOrganizationId" TEXT,
  FOREIGN KEY ("user_id") REFERENCES authcore_system.users(id) ON DELETE CASCADE
);

-- Create verification tokens table
CREATE TABLE IF NOT EXISTS authcore_system.verificationtokens (
  identifier TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  UNIQUE (identifier, token)
);

-- Create organizations table
CREATE TABLE IF NOT EXISTS authcore_system.organizations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  logo TEXT,
  metadata TEXT
);

-- Create member table
CREATE TABLE IF NOT EXISTS authcore_system.member (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  role TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL,
  FOREIGN KEY ("organizationId") REFERENCES authcore_system.organizations(id) ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES authcore_system.users(id) ON DELETE CASCADE
);

-- Create invitation table
CREATE TABLE IF NOT EXISTS authcore_system.invitation (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "inviterId" TEXT NOT NULL,
  FOREIGN KEY ("organizationId") REFERENCES authcore_system.organizations(id) ON DELETE CASCADE,
  FOREIGN KEY ("inviterId") REFERENCES authcore_system.users(id) ON DELETE CASCADE
);

-- Create verification table
CREATE TABLE IF NOT EXISTS authcore_system.verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

SELECT 'Admin auth tables created in authcore_system schema' as result;
