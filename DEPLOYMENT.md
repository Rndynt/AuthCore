# Auth Service Deployment Guide

## Production Deployment on Netlify

### 1. Repository Setup
1. Initialize git repository and push to GitHub/GitLab
2. Connect repository to Netlify

### 2. Environment Variables
Set these in Netlify UI (Site Settings > Environment Variables):

```bash
BETTER_AUTH_URL=https://your-site-name.netlify.app
BETTER_AUTH_SECRET=your-long-secure-random-string-min-32-chars
TRUSTED_ORIGINS=https://your-frontend-domain.com,https://your-admin-domain.com
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
```

### 3. Build Settings
- **Build command**: `npm run build && npx prisma generate`
- **Publish directory**: `dist` 
- **Functions directory**: `netlify/functions`

### 4. Database Migration
Add to package.json for production deployment:
```json
{
  "scripts": {
    "postbuild": "npx prisma migrate deploy"
  }
}
```

### 5. Frontend Integration
Your frontend can now call the auth service:

```javascript
// Sign up
const signUp = async (email, password) => {
  const response = await fetch('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password })
  });
  return response.json();
};

// Sign in  
const signIn = async (email, password) => {
  const response = await fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password })
  });
  return response.json();
};

// Get current session
const getSession = async () => {
  const response = await fetch('/api/auth/session', {
    credentials: 'include'
  });
  return response.json();
};

// Sign out
const signOut = async () => {
  const response = await fetch('/api/auth/sign-out', {
    method: 'POST',
    credentials: 'include'
  });
  return response.json();
};
```

### 6. Service-to-Service Authentication

#### API Keys
1. Create a service user through admin panel
2. Generate API key for that user
3. Use in other services:

```javascript
const response = await fetch('https://your-auth-service.netlify.app/api/protected', {
  headers: {
    'x-api-key': 'your-generated-api-key'
  }
});
```

#### JWT Verification (for microservices)
```javascript
// Get JWKS endpoint
const jwksResponse = await fetch('https://your-auth-service.netlify.app/api/auth/jwks');
const jwks = await jwksResponse.json();

// Verify JWT tokens using the JWKS in your services
```

### 7. Organizations & RBAC
- Create organizations through the admin interface
- Assign users to organizations with roles (admin, member, viewer)
- Check user permissions in your application logic

### 8. Monitoring & Logging
- Monitor authentication failures
- Set up alerts for unusual activity
- Use Netlify Analytics for request monitoring
- Consider adding structured logging for audit trails

### 9. Security Considerations
- Use HTTPS only in production
- Set secure cookie flags
- Implement rate limiting
- Regular security audits
- Keep dependencies updated
- Use strong BETTER_AUTH_SECRET (min 32 chars)

### 10. Backup & Recovery
- Regular database backups
- Document recovery procedures
- Test restore processes
- Keep multiple environment configurations