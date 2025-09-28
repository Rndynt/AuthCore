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