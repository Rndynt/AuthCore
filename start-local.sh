#!/bin/bash
# Local development startup script
# Starts PostgreSQL, runs migrations, and starts both servers

set -e

echo "=== Starting Local Development Environment ==="

# 1. Start PostgreSQL
echo "Starting PostgreSQL..."
su -c "/usr/lib/postgresql/14/bin/pg_ctl start -D /var/lib/postgresql/14/main -o '-c config_file=/etc/postgresql/14/main/postgresql.conf' -l /tmp/pg.log" postgres 2>/dev/null || true
sleep 2

# 2. Set postgres password
su -c "psql -c \"ALTER USER postgres PASSWORD 'postgres';\"" postgres 2>/dev/null || true

# 3. Create database if not exists
su -c "createdb authdb 2>/dev/null || true" postgres 2>/dev/null || true

# 4. Create realmio role if not exists
su -c "psql -d authdb -c \"CREATE ROLE realmio WITH LOGIN PASSWORD 'realmio';\" 2>/dev/null || true" postgres 2>/dev/null || true

# 5. Run migrations
echo "Running database migrations..."
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/authdb" npx prisma migrate deploy 2>&1 | tail -5

# 6. Start backend server
echo "Starting backend API server on port 4000..."
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/authdb" \
BETTER_AUTH_SECRET="super-secret-key-for-authcore-minimum-24chars" \
AUTH_MODE=multi \
npx tsx src/server.ts > /tmp/server.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# 7. Start admin UI
echo "Starting Admin UI on port 3001..."
cd admin-ui && NEXT_PUBLIC_API_URL=http://localhost:4000 NODE_ENV=development npx next dev --port 3001 > /tmp/admin-ui.log 2>&1 &
ADMIN_PID=$!
echo "Admin UI PID: $ADMIN_PID"
cd ..

# 8. Wait and verify
sleep 12
echo ""
echo "=== Service Status ==="
curl -s http://localhost:4000/healthz && echo " ✅ Backend API running at http://localhost:4000"
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3001/ && echo " ✅ Admin UI running at http://localhost:3001"
echo ""
echo "=== Access URLs ==="
echo "  Backend API:  http://localhost:4000"
echo "  Health Check: http://localhost:4000/healthz"
echo "  Admin UI:     http://localhost:3001"
echo "  Admin Login:  http://localhost:3001/login"
echo ""
echo "Logs: tail -f /tmp/server.log /tmp/admin-ui.log"
