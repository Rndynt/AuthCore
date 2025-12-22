# VPS/Server Deployment Guide - Auth Service Setup

Dokumentasi lengkap untuk deploy Auth Service di server VPS atau server biasa (bukan Replit).

## 🔧 Prerequisites untuk VPS

- **OS**: Ubuntu 20.04 LTS atau lebih baru (atau Linux distro lain)
- **Node.js**: v20.x LTS
- **npm**: v10+
- **PostgreSQL**: v14 atau lebih baru
- **Git**: untuk clone repository
- **Sudo/Root Access**: untuk install system packages
- **Domain/IP**: untuk akses aplikasi

## 📥 Step 1: Setup Server Awal

### 1.1 Update System Packages

```bash
sudo apt update
sudo apt upgrade -y
```

### 1.2 Install Node.js v20 LTS

```bash
# Tambah NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verify installation
node --version  # Should be v20.x.x
npm --version   # Should be v10.x.x
```

### 1.3 Install PostgreSQL

```bash
# Add PostgreSQL repository
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Verify installation
sudo -u postgres psql --version
```

### 1.4 Install Git

```bash
sudo apt install -y git
```

## 📂 Step 2: Clone & Setup Project

### 2.1 Clone Repository

```bash
# Pilih lokasi yang sesuai (misal /opt atau /home/username)
cd /opt
git clone https://github.com/your-username/auth-service.git
cd auth-service

# Atau via SSH
git clone git@github.com:your-username/auth-service.git
cd auth-service
```

### 2.2 Install Dependencies

```bash
npm install

# Output yang diharapkan:
# added 1552 packages, and audited 1554 packages in 56s
```

## 🗄️ Step 3: Setup PostgreSQL Database

### 3.1 Create PostgreSQL User & Database

```bash
# Login ke PostgreSQL
sudo -u postgres psql

# Di dalam psql prompt:
```

```sql
-- Create database user
CREATE USER auth_user WITH PASSWORD 'strong_password_here_12345!';

-- Alter user untuk dapat create database
ALTER USER auth_user CREATEDB;

-- Create database
CREATE DATABASE auth_service OWNER auth_user;

-- Give privileges
GRANT ALL PRIVILEGES ON DATABASE auth_service TO auth_user;
GRANT ALL ON SCHEMA public TO auth_user;

-- Exit
\q
```

### 3.2 Test Database Connection

```bash
# Test connection dari server (bukan as postgres user)
psql -h localhost -U auth_user -d auth_service -c "SELECT version();"

# Akan diminta password, masukkan password yang dibuat di step 3.1
```

### 3.3 Setup .env File

Buat file `.env` di root project:

```bash
cd /opt/auth-service
nano .env
```

Isi dengan:

```env
# DATABASE
DATABASE_URL="postgresql://auth_user:strong_password_here_12345!@localhost:5432/auth_service"
PGHOST=localhost
PGPORT=5432
PGUSER=auth_user
PGPASSWORD=strong_password_here_12345!
PGDATABASE=auth_service

# SERVER
NODE_ENV=production
PORT=3000

# AUTH
AUTH_SECRET=your_secret_key_here_change_this_to_random_string_minimum_32_chars

# ADMIN SETTINGS
ADMIN_EMAIL=admin@yourdomain.com
```

**⚠️ PENTING:**
- Ganti `strong_password_here_12345!` dengan password yang KUAT
- Ganti `your_secret_key_here_...` dengan random string 32+ characters:
  ```bash
  # Generate random secret
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Jangan share `.env` ke git!

Tambah `.env` ke `.gitignore`:

```bash
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
```

## 🗄️ Step 4: Setup Database Schema (SAMA SEPERTI REPLIT)

### 4.1 Sync Prisma Schema

```bash
npx prisma db push --force-reset
```

**Output yang diharapkan:**
```
Prisma schema loaded from prisma/schema.prisma
The PostgreSQL database "auth_service" was successfully reset.
🚀 Your database is now in sync with your Prisma schema. Done in 320ms
```

### 4.2 Setup Admin System Schema

```bash
psql -h localhost -U auth_user -d auth_service -f scripts/setup-admin-schema.sql
```

**Output yang diharapkan:**
```
CREATE SCHEMA
CREATE TABLE (x12)
CREATE INDEX
authcore_system schema setup completed successfully!
```

### 4.3 Create Public Schema Tables

```bash
psql -h localhost -U auth_user -d auth_service -f src/multi-tenant/schema.sql
```

**Output yang diharapkan:**
```
CREATE TABLE
CREATE INDEX
INSERT 0 3
INSERT 0 3
```

### 4.4 Provision Tenant Schemas

```bash
# Set DATABASE_URL jika belum
export DATABASE_URL="postgresql://auth_user:strong_password_here_12345!@localhost:5432/auth_service"

npx tsx src/multi-tenant/provision-schemas.ts
```

**Output yang diharapkan:**
```
🚀 Starting tenant schema provisioning...

📁 Provisioning schema for: Crypto Exchange (tenant_crypto)
   ✅ Schema created: tenant_crypto
   ✅ Table cloned: tenant_crypto.users
   ... (12 tables total)

📁 Provisioning schema for: POS Kasir (tenant_pos)
   ...

📁 Provisioning schema for: Ticketing System (tenant_ticket)
   ...

✅ All tenant schemas provisioned successfully!
```

## ▶️ Step 5: Build & Start Application

### 5.1 Build untuk Production

```bash
npm run build
```

**Output yang diharapkan:**
```
> auth-service-better-auth@1.0.0 build
> tsc -p tsconfig.json
```

### 5.2 Test Run

```bash
# Test dengan NODE_ENV=production
NODE_ENV=production node dist/server.js
```

**Output yang diharapkan:**
```
🔧 AuthCore Configuration:
   Mode: MULTI
✅ Loaded 3 tenants into registry
✅ Multi-tenant manager initialized
✅ Admin routes registered
[HH:MM:SS.sss] INFO: Server listening at http://0.0.0.0:3000
[HH:MM:SS.sss] INFO: Auth service running on port 3000
```

**Stop dengan:** `CTRL + C`

## 🚀 Step 6: Setup Process Manager (PM2)

Gunakan PM2 untuk manage process di background dan auto-restart.

### 6.1 Install PM2 Globally

```bash
sudo npm install -g pm2
```

### 6.2 Create PM2 Ecosystem Config

Buat file `ecosystem.config.js` di root project:

```javascript
module.exports = {
  apps: [
    {
      name: 'auth-service',
      script: './dist/server.js',
      instances: 'max',  // Use all CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      watch: false,  // Jangan watch di production
      ignore_watch: ['node_modules', 'dist/.next'],
      max_memory_restart: '500M',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
```

### 6.3 Start Application dengan PM2

```bash
pm2 start ecosystem.config.js

# Verify status
pm2 status

# View logs
pm2 logs auth-service
```

### 6.4 Setup PM2 Startup

Agar aplikasi auto-start saat server reboot:

```bash
pm2 startup systemd -u $USER --hp /home/$USER
# Copy command output dan run
# Example: sudo /path/to/pm2/startup/

# Save PM2 config
pm2 save
```

Verify:
```bash
sudo systemctl status pm2-$USER
```

## 🔒 Step 7: Setup Nginx Reverse Proxy

### 7.1 Install Nginx

```bash
sudo apt install -y nginx
```

### 7.2 Create Nginx Config

```bash
sudo nano /etc/nginx/sites-available/auth-service
```

Isi dengan:

```nginx
upstream auth_service {
    server 127.0.0.1:3000;
    keepalive 64;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com *.yourdomain.com;
    
    location / {
        return 301 https://$server_name$request_uri;
    }

    # Let's Encrypt verification
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
}

# HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com *.yourdomain.com;

    # SSL Certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy settings
    location / {
        proxy_pass http://auth_service;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_redirect off;
    }

    # Cache static files
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 7.3 Enable Nginx Config

```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/auth-service /etc/nginx/sites-enabled/

# Remove default config jika ada
sudo rm /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

## 🔐 Step 8: Setup SSL Certificate (Let's Encrypt)

### 8.1 Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 8.2 Get Certificate

```bash
sudo certbot certonly --nginx -d yourdomain.com -d www.yourdomain.com -d *.yourdomain.com
```

### 8.3 Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Enable auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

## 👤 Step 9: Create Admin User

```bash
# Ensure app is running first
curl -X POST https://yourdomain.com/admin/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourdomain.com",
    "password": "StrongPassword123!",
    "name": "Admin User"
  }'
```

## 📊 Step 10: Monitoring & Maintenance

### 10.1 Check Application Status

```bash
# PM2 status
pm2 status

# View logs
pm2 logs auth-service

# System resources
pm2 monit
```

### 10.2 Database Backup

```bash
# Manual backup
pg_dump -h localhost -U auth_user -d auth_service > backup_$(date +%Y%m%d).sql

# Automated backup (cron)
# Edit crontab
crontab -e

# Add line for daily backup at 2 AM
0 2 * * * pg_dump -h localhost -U auth_user -d auth_service > /backups/auth_service_$(date +\%Y\%m\%d).sql
```

### 10.3 Log Rotation

PM2 already handles log rotation. Check logs:

```bash
pm2 logs auth-service --lines 100
```

### 10.4 Update Application

```bash
cd /opt/auth-service

# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Rebuild
npm run build

# Restart with PM2
pm2 restart auth-service
```

## 🔄 Perbedaan Setup: Replit vs VPS

| Aspek | Replit | VPS |
|-------|--------|-----|
| **Database** | Built-in Neon | Manual PostgreSQL install |
| **Env Variables** | UI automatic | .env file manual |
| **Port** | 5000 (fixed) | Any port (recommended 3000+) |
| **SSL/HTTPS** | Automatic | Let's Encrypt manual setup |
| **Process Manager** | Workflow auto | PM2 manual setup |
| **Reverse Proxy** | Not needed | Nginx/Apache |
| **Domain** | Replit subdomain | Custom domain |
| **Scaling** | Auto | Manual with load balancer |
| **Logs** | Replit dashboard | PM2/Nginx logs |
| **Backup** | Replit managed | Manual setup |

## 📋 Full Setup Commands (Copy-Paste)

```bash
#!/bin/bash
# Setup script untuk VPS (run as sudo)

# 1. Update system
apt update && apt upgrade -y

# 2. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 3. Install PostgreSQL
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
apt install -y postgresql postgresql-contrib

# 4. Install Git & Nginx
apt install -y git nginx certbot python3-certbot-nginx

# 5. Install PM2
npm install -g pm2

# 6. Clone project
mkdir -p /opt
cd /opt
git clone https://github.com/your-username/auth-service.git
cd auth-service

# 7. Install dependencies
npm install

# 8. Build
npm run build

# Done! Continue with manual steps (PostgreSQL user, .env, etc)
```

## 🎯 Production Checklist

- [ ] Node.js v20 installed
- [ ] PostgreSQL installed & running
- [ ] Database user & database created
- [ ] .env file configured with strong credentials
- [ ] DATABASE_URL verified
- [ ] Prisma migrations synced
- [ ] All SQL setup scripts run
- [ ] npm run build successful
- [ ] PM2 installed & running
- [ ] Nginx configured & running
- [ ] SSL certificate installed
- [ ] Admin user created
- [ ] Admin login tested
- [ ] PM2 startup configured
- [ ] Backup strategy setup
- [ ] Monitoring configured

## 🐛 Troubleshooting VPS

### Error: "could not connect to server: Connection refused"
```bash
# Check if PostgreSQL running
sudo systemctl status postgresql

# Start if not running
sudo systemctl start postgresql
```

### Error: "role auth_user does not exist"
```bash
# Create user lagi
sudo -u postgres psql
CREATE USER auth_user WITH PASSWORD 'new_password';
```

### Error: "EADDRINUSE: address already in use :::3000"
```bash
# Find process on port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port in .env
```

### PM2 not starting
```bash
# Check PM2 logs
pm2 logs auth-service

# Restart all
pm2 kill
pm2 start ecosystem.config.js
```

### Nginx not working
```bash
# Test config
sudo nginx -t

# Check status
sudo systemctl status nginx

# View logs
sudo tail -f /var/log/nginx/error.log
```

## 📚 Resources

- [Node.js Official](https://nodejs.org/)
- [PostgreSQL Official](https://www.postgresql.org/)
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/)
- [Better Auth Docs](https://www.better-auth.com/)

## ⚠️ Security Best Practices

1. **Change Default Credentials** - Ganti semua default passwords
2. **Use Strong Passwords** - Min 16+ characters, mix case, numbers, symbols
3. **Enable Firewall**:
   ```bash
   sudo apt install ufw
   sudo ufw enable
   sudo ufw allow 22/tcp  # SSH
   sudo ufw allow 80/tcp  # HTTP
   sudo ufw allow 443/tcp # HTTPS
   ```
4. **SSH Key Authentication** - Disable password login
5. **Regular Backups** - Setup automated backups
6. **Keep Updated** - Regular security updates: `apt update && apt upgrade`
7. **Monitor Logs** - Setup log monitoring & alerts
8. **Database Backups** - Keep offline backups

---

**Last Updated:** December 22, 2025
**Version:** 1.0
