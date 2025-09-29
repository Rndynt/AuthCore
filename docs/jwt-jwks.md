# JWT/JWKS Integration Guide

This guide covers JSON Web Token (JWT) issuance and verification using JWKS (JSON Web Key Set) for offline validation in distributed services.

## Overview

AuthCore provides JWT tokens for stateless authentication that can be verified offline by resource servers without calling back to the auth service.

**Flow:**
1. Client authenticates with AuthCore (cookie session)
2. AuthCore issues short-lived JWT token
3. Client includes JWT in requests to resource services
4. Resource services verify JWT offline using JWKS public keys

## JWT Token Structure

```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT",
    "kid": "key-id-1"
  },
  "payload": {
    "iss": "https://your-auth-service.netlify.app",
    "aud": "your-service-name",
    "sub": "user-id",
    "iat": 1640995200,
    "exp": 1640998800,
    "scopes": ["orders:read", "orders:write"]
  }
}
```

## Issuing JWT Tokens

### Via DEV Endpoint (Development)

```bash
# Issue JWT with 30-minute TTL
curl -i -c cookie.txt -b cookie.txt -X POST https://your-auth-service.netlify.app/dev/jwt/issue \
  -H "Content-Type: application/json" \
  --data '{
    "ttlSeconds": 1800,
    "audience": "orders-api",
    "scopes": ["orders:read", "orders:write"]
  }'

# Response
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIs...",
  "expiresAt": "2025-01-01T12:30:00.000Z"
}
```

### Programmatic Issuance

```typescript
// In your application
import { auth } from './auth'

async function issueJWT(userId: string, audience: string, scopes: string[]) {
  const session = await auth.api.getSession({ 
    headers: { /* user session headers */ }
  })
  
  if (!session?.user) {
    throw new Error('Authentication required')
  }

  // Use DEV endpoint or implement custom JWT issuance
  const response = await fetch(`${AUTH_SERVICE_URL}/dev/jwt/issue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie
    },
    body: JSON.stringify({
      ttlSeconds: 1800,
      audience,
      scopes
    })
  })

  return response.json()
}
```

## JWKS Endpoint

The JWKS endpoint provides public keys for JWT verification:

```bash
curl -s https://your-auth-service.netlify.app/dev/jwks.json
```

**Response:**
```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "key-id-1",
      "use": "sig",
      "alg": "RS256",
      "n": "base64-encoded-modulus",
      "e": "AQAB"
    }
  ]
}
```

## Verification in Resource Services

### Node.js with `jose` Library

```typescript
import { jwtVerify, createRemoteJWKSet } from 'jose'

const JWKS = createRemoteJWKSet(
  new URL('https://your-auth-service.netlify.app/dev/jwks.json')
)

export async function verifyJWT(token: string, expectedAudience: string) {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'https://your-auth-service.netlify.app',
      audience: expectedAudience
    })

    return {
      userId: payload.sub,
      scopes: payload.scopes || [],
      organizationId: payload.org_id,
      isValid: true
    }
  } catch (error) {
    return {
      isValid: false,
      error: error.message
    }
  }
}

// Usage in Express middleware
export function requireJWT(requiredScopes: string[] = []) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Bearer token required' })
    }

    const token = authHeader.substring(7)
    const result = await verifyJWT(token, 'orders-api')

    if (!result.isValid) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    // Check scopes
    const hasRequiredScopes = requiredScopes.every(
      scope => result.scopes.includes(scope)
    )

    if (!hasRequiredScopes) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }

    req.user = {
      id: result.userId,
      scopes: result.scopes,
      organizationId: result.organizationId
    }

    next()
  }
}
```

### Go Implementation

```go
package auth

import (
    "context"
    "crypto/rsa"
    "fmt"
    "time"

    "github.com/golang-jwt/jwt/v5"
    "github.com/lestrrat-go/jwx/v2/jwk"
)

type JWTValidator struct {
    jwksURL    string
    issuer     string
    audience   string
    keySet     jwk.Set
    lastFetch  time.Time
}

func NewJWTValidator(jwksURL, issuer, audience string) *JWTValidator {
    return &JWTValidator{
        jwksURL:  jwksURL,
        issuer:   issuer,
        audience: audience,
    }
}

func (v *JWTValidator) fetchKeys() error {
    if time.Since(v.lastFetch) < 5*time.Minute && v.keySet != nil {
        return nil // Use cached keys
    }

    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    keySet, err := jwk.Fetch(ctx, v.jwksURL)
    if err != nil {
        return fmt.Errorf("failed to fetch JWKS: %w", err)
    }

    v.keySet = keySet
    v.lastFetch = time.Now()
    return nil
}

func (v *JWTValidator) ValidateToken(tokenString string) (*jwt.Token, error) {
    if err := v.fetchKeys(); err != nil {
        return nil, err
    }

    token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
        kid, ok := token.Header["kid"].(string)
        if !ok {
            return nil, fmt.Errorf("missing kid in token header")
        }

        key, ok := v.keySet.LookupKeyID(kid)
        if !ok {
            return nil, fmt.Errorf("key not found: %s", kid)
        }

        var rawKey interface{}
        if err := key.Raw(&rawKey); err != nil {
            return nil, fmt.Errorf("failed to get raw key: %w", err)
        }

        return rawKey, nil
    })

    if err != nil {
        return nil, err
    }

    // Validate claims
    claims, ok := token.Claims.(jwt.MapClaims)
    if !ok {
        return nil, fmt.Errorf("invalid claims")
    }

    if claims["iss"] != v.issuer {
        return nil, fmt.Errorf("invalid issuer")
    }

    if claims["aud"] != v.audience {
        return nil, fmt.Errorf("invalid audience")
    }

    return token, nil
}
```

## Security Best Practices

### Token Lifetime
- **Short TTL**: Use 15-30 minutes for JWT tokens
- **Refresh Pattern**: Issue new JWTs before expiration
- **No Revocation**: JWTs cannot be revoked; rely on short expiration

### Key Rotation
- **Regular Rotation**: Rotate signing keys periodically
- **Multiple Keys**: Support multiple active keys during rotation
- **JWKS Updates**: Resource services automatically fetch new keys

### Validation Checklist
```typescript
// Always validate these claims
function validateClaims(payload: any) {
  return [
    payload.iss === EXPECTED_ISSUER,      // Issuer
    payload.aud === EXPECTED_AUDIENCE,    // Audience
    payload.exp > Math.floor(Date.now() / 1000), // Not expired
    payload.iat <= Math.floor(Date.now() / 1000), // Not issued in future
    typeof payload.sub === 'string',      // Subject (user ID)
  ].every(Boolean)
}
```

## Error Handling

### Common JWT Errors

```typescript
export enum JWTError {
  MISSING_TOKEN = 'missing_token',
  INVALID_FORMAT = 'invalid_format', 
  EXPIRED = 'expired',
  INVALID_SIGNATURE = 'invalid_signature',
  INVALID_ISSUER = 'invalid_issuer',
  INVALID_AUDIENCE = 'invalid_audience',
  JWKS_FETCH_FAILED = 'jwks_fetch_failed'
}

export function handleJWTError(error: any): { code: JWTError, message: string } {
  if (error.code === 'ERR_JWT_EXPIRED') {
    return { code: JWTError.EXPIRED, message: 'Token has expired' }
  }
  
  if (error.code === 'ERR_JWKS_NO_MATCHING_KEY') {
    return { code: JWTError.INVALID_SIGNATURE, message: 'Invalid token signature' }
  }
  
  // Add more specific error handling...
  return { code: JWTError.INVALID_FORMAT, message: 'Invalid token format' }
}
```

## Testing JWT Integration

```bash
#!/bin/bash
# Test script for JWT verification

AUTH_URL="https://your-auth-service.netlify.app"
RESOURCE_URL="https://your-resource-service.com"

# 1. Sign in and get session cookie
curl -c cookie.txt -X POST $AUTH_URL/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  --data '{"email":"test@example.com","password":"password"}'

# 2. Issue JWT token
JWT_RESPONSE=$(curl -s -b cookie.txt -X POST $AUTH_URL/dev/jwt/issue \
  -H "Content-Type: application/json" \
  --data '{"ttlSeconds":1800,"audience":"orders-api"}')

JWT_TOKEN=$(echo $JWT_RESPONSE | jq -r '.token')

# 3. Test resource service with JWT
curl -H "Authorization: Bearer $JWT_TOKEN" $RESOURCE_URL/protected-endpoint

# 4. Verify token structure
echo $JWT_TOKEN | cut -d. -f2 | base64 -d | jq
```

## Production Deployment

### Environment Configuration
```bash
# Auth Service
BETTER_AUTH_URL=https://auth.yourcompany.com
ENABLE_DEV_ENDPOINTS=false

# Resource Services  
AUTH_JWKS_URL=https://auth.yourcompany.com/api/auth/jwks
JWT_ISSUER=https://auth.yourcompany.com
JWT_AUDIENCE=your-service-name
```

### Monitoring & Metrics
- **Token Issuance**: Track JWT creation rates
- **Validation Failures**: Monitor invalid token attempts
- **Key Rotation**: Alert on JWKS fetch failures
- **Performance**: Measure JWT verification latency