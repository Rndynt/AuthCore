-- Create auth tables for tenant schemas
-- This SQL is based on Prisma schema

DO $$
DECLARE
  schema_name text;
BEGIN
  -- Loop through each tenant schema
  FOR schema_name IN SELECT unnest(ARRAY['tenant_pos', 'tenant_ticket', 'tenant_crypto']) LOOP
    -- Set search path
    EXECUTE format('SET search_path TO %I, public', schema_name);
    
    -- Create users table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.users (
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
      )', schema_name);

    -- Create accounts table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.accounts (
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
        FOREIGN KEY ("user_id") REFERENCES %I.users(id) ON DELETE CASCADE
      )', schema_name, schema_name);

    -- Create sessions table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.sessions (
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
        FOREIGN KEY ("user_id") REFERENCES %I.users(id) ON DELETE CASCADE
      )', schema_name, schema_name);

    -- Create verification tokens table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.verificationtokens (
        identifier TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires TIMESTAMPTZ NOT NULL,
        UNIQUE (identifier, token)
      )', schema_name);

    -- Create api_keys table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.api_keys (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name TEXT NOT NULL,
        key TEXT UNIQUE NOT NULL,
        "user_id" TEXT,
        "expires_at" TIMESTAMPTZ,
        permissions JSONB,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    -- Create organizations table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.organizations (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
        logo TEXT,
        metadata TEXT
      )', schema_name);

    -- Create organization_members table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.organization_members (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "user_id" TEXT NOT NULL,
        "organization_id" TEXT NOT NULL,
        role TEXT DEFAULT ''member'',
        "invited_by" TEXT,
        "joinedAt" TIMESTAMPTZ DEFAULT NOW(),
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE ("user_id", "organization_id"),
        FOREIGN KEY ("organization_id") REFERENCES %I.organizations(id) ON DELETE CASCADE
      )', schema_name, schema_name);

    -- Create member table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.member (
        id TEXT PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        role TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL,
        FOREIGN KEY ("organizationId") REFERENCES %I.organizations(id) ON DELETE CASCADE,
        FOREIGN KEY ("userId") REFERENCES %I.users(id) ON DELETE CASCADE
      )', schema_name, schema_name, schema_name);

    -- Create invitation table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.invitation (
        id TEXT PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT,
        status TEXT NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "inviterId" TEXT NOT NULL,
        FOREIGN KEY ("organizationId") REFERENCES %I.organizations(id) ON DELETE CASCADE,
        FOREIGN KEY ("inviterId") REFERENCES %I.users(id) ON DELETE CASCADE
      )', schema_name, schema_name, schema_name);

    -- Create apikey table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.apikey (
        id TEXT PRIMARY KEY,
        name TEXT,
        start TEXT,
        prefix TEXT,
        key TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "refillInterval" INTEGER,
        "refillAmount" INTEGER,
        "lastRefillAt" TIMESTAMPTZ,
        enabled BOOLEAN DEFAULT true,
        "rateLimitEnabled" BOOLEAN DEFAULT true,
        "rateLimitTimeWindow" INTEGER,
        "rateLimitMax" INTEGER,
        "requestCount" INTEGER,
        remaining INTEGER,
        "lastRequest" TIMESTAMPTZ,
        "expiresAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL,
        "updatedAt" TIMESTAMPTZ NOT NULL,
        permissions TEXT,
        metadata TEXT,
        FOREIGN KEY ("userId") REFERENCES %I.users(id) ON DELETE CASCADE
      )', schema_name, schema_name);

    -- Create jwks table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.jwks (
        id TEXT PRIMARY KEY,
        "publicKey" TEXT NOT NULL,
        "privateKey" TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL
      )', schema_name);

    -- Create verification table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.verification (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    RAISE NOTICE 'Created tables for schema: %', schema_name;
  END LOOP;
END $$;
