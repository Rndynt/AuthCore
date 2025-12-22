# Setup Comparison: Replit vs VPS/Server

Dokumentasi perbandingan lengkap antara setup di Replit vs di Server VPS biasa.

## 📋 Quick Comparison Table

| Step | Replit | VPS/Server |
|------|--------|-----------|
| **1. Install Node.js** | ✅ Sudah ada | ❌ Install manual: `curl -fsSL https://deb.nodesource.com/setup_20.x \| bash -` |
| **2. Install PostgreSQL** | ✅ Sudah ada (Neon) | ❌ Install manual: `apt install postgresql` |
| **3. Create Database** | ✅ UI button di Replit | ❌ `sudo -u postgres psql` & SQL commands |
| **4. Env Variables** | ✅ Auto dari Replit | ❌ Manual `.env` file |
| **5. Port** | 5000 (fixed) | Custom (recommended 3000+) |
| **6. npm install** | Sama | Sama |
| **7. Prisma sync** | `npx prisma db push --force-reset` | Sama |
| **8. SQL setup** | Sama | Sama |
| **9. Provision tenants** | Sama | Sama |
| **10. Start app** | `npm run dev` | `npm run build` + PM2 |
| **11. Domain/HTTPS** | ✅ Auto https://domain.replit.dev | ❌ Manual Nginx + Let's Encrypt |
| **12. Process manager** | ✅ Workflow auto | ❌ PM2 manual |
| **13. Scaling** | ✅ Auto | ❌ Manual setup |

## 🎯 Step-by-Step Comparison

### STEP 1: Setup Awal

#### ❌ Replit
```bash
# Langsung ke terminal, tidak perlu install Node.js atau PostgreSQL
# Semua sudah ready
```

#### ✅ VPS
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo sh -c 'echo "deb ..." > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt install -y postgresql postgresql-contrib

# Install Nginx (untuk reverse proxy)
sudo apt install -y nginx

# Verify
node --version
psql --version
nginx --version
```

---

### STEP 2: Clone & Install Dependencies

#### Sama untuk kedua-duanya ✅
```bash
git clone <repository>
cd auth-service
npm install
```

---

### STEP 3: Setup Database Connection

#### ❌ Replit
1. Buka **Database** tab di kanan Replit
2. Click **Create Database**
3. Env variables otomatis tersedia:
   - `DATABASE_URL` ✅
   - `PGHOST` ✅
   - `PGPORT` ✅
   - `PGUSER` ✅
   - `PGPASSWORD` ✅
   - `PGDATABASE` ✅

**Tidak perlu buat `.env` file - Replit handle otomatis**

#### ✅ VPS - Manual Setup

**3.1: Create Database User**
```bash
sudo -u postgres psql

# Inside psql:
CREATE USER auth_user WITH PASSWORD 'strong_password_here!';
ALTER USER auth_user CREATEDB;
CREATE DATABASE auth_service OWNER auth_user;
GRANT ALL PRIVILEGES ON DATABASE auth_service TO auth_user;
\q
```

**3.2: Create `.env` File**
```bash
nano .env
```

```env
DATABASE_URL="postgresql://auth_user:strong_password_here!@localhost:5432/auth_service"
PGHOST=localhost
PGPORT=5432
PGUSER=auth_user
PGPASSWORD=strong_password_here!
PGDATABASE=auth_service
NODE_ENV=production
PORT=3000
AUTH_SECRET=your_random_32_char_string
```

**3.3: Generate Random Secret**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**3.4: Add `.env` to `.gitignore`**
```bash
echo ".env" >> .gitignore
```

---

### STEP 4: Sync Prisma Schema

#### Sama untuk kedua-duanya ✅

```bash
npx prisma db push --force-reset
```

Expected output untuk kedua environment:
```
The PostgreSQL database was successfully reset.
🚀 Your database is now in sync with your Prisma schema.
```

---

### STEP 5: Setup Admin System Schema

#### Sama untuk kedua-duanya ✅

**Replit:**
```bash
psql -h $PGHOST -U $PGUSER -d $PGDATABASE -f scripts/setup-admin-schema.sql
```

**VPS:**
```bash
psql -h localhost -U auth_user -d auth_service -f scripts/setup-admin-schema.sql
```

Output sama untuk kedua-duanya:
```
CREATE SCHEMA
CREATE TABLE (x12)
authcore_system schema setup completed successfully!
```

---

### STEP 6: Create Public Schema Tables

#### Sama untuk kedua-duanya ✅

```bash
psql -h $PGHOST -U $PGUSER -d $PGDATABASE -f src/multi-tenant/schema.sql
```

---

### STEP 7: Provision Tenant Schemas

#### Sama untuk kedua-duanya ✅

**Replit:**
```bash
npx tsx src/multi-tenant/provision-schemas.ts
```

**VPS:**
```bash
export DATABASE_URL="postgresql://auth_user:strong_password_here!@localhost:5432/auth_service"
npx tsx src/multi-tenant/provision-schemas.ts
```

Output sama:
```
✅ All tenant schemas provisioned successfully!
```

---

### STEP 8: Start Application

#### ❌ Replit - Development Mode
```bash
npm run dev
```

**Output:**
```
Server listening at http://0.0.0.0:5000
Auth service running on port 5000
```

**Akses di:** https://domain.replit.dev (auto HTTPS)

#### ✅ VPS - Production Mode

**8.1: Build**
```bash
npm run build
```

**8.2: Install PM2 (Process Manager)**
```bash
sudo npm install -g pm2
```

**8.3: Create `ecosystem.config.js`**
```javascript
module.exports = {
  apps: [{
    name: 'auth-service',
    script: './dist/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

**8.4: Start dengan PM2**
```bash
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

**8.5: Setup Nginx Reverse Proxy**
```bash
sudo nano /etc/nginx/sites-available/auth-service
# Paste nginx config (see DEPLOYMENT_VPS.md)

sudo ln -s /etc/nginx/sites-available/auth-service /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**8.6: Setup SSL Certificate**
```bash
sudo certbot certonly --nginx -d yourdomain.com -d www.yourdomain.com
```

**Akses di:** https://yourdomain.com (SSL via Let's Encrypt)

---

### STEP 9: Create Admin User

#### Replit
```bash
curl -X POST http://localhost:5000/admin/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin123!",
    "name": "Admin User"
  }'
```

Langsung akses dari dashboard Replit port preview.

#### VPS
```bash
curl -X POST https://yourdomain.com/admin/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourdomain.com",
    "password": "Admin123!",
    "name": "Admin User"
  }'
```

Atau buka di browser: https://yourdomain.com/login

---

## 📊 Environment Variables Comparison

### ❌ Replit (Automatic)
```
Replit otomatis set ini via database:
✅ DATABASE_URL (auto)
✅ PGHOST (auto)
✅ PGPORT (auto)
✅ PGUSER (auto)
✅ PGPASSWORD (auto)
✅ PGDATABASE (auto)

Tidak perlu .env file - Replit handle semua
```

### ✅ VPS (Manual .env)
```
Harus manual buat .env file dengan:
❌ DATABASE_URL=postgresql://...
❌ PGHOST=localhost
❌ PGPORT=5432
❌ PGUSER=auth_user
❌ PGPASSWORD=your_password
❌ PGDATABASE=auth_service
❌ NODE_ENV=production
❌ PORT=3000
❌ AUTH_SECRET=your_secret_32_chars

Semua harus manual diatur
```

---

## 🌐 Domain & HTTPS Comparison

### ❌ Replit (Automatic)
- **Domain**: Automatically get `https://your-project.replit.dev`
- **HTTPS**: ✅ Auto HTTPS (Replit managed)
- **Subdomain**: ✅ Auto `https://subdomain-your-project.replit.dev`
- **Custom Domain**: ✅ Bisa tapi di-manage Replit
- **Multi-tenant**: ✅ Bisa pakai `https://tenant.your-project.replit.dev`

### ✅ VPS (Manual)
- **Domain**: Harus beli domain sendiri (Namecheap, GoDaddy, etc)
- **HTTPS**: ❌ Manual setup Let's Encrypt
- **Subdomain**: ✅ Setup di DNS settings
- **Custom Domain**: ✅ Full control (A record, CNAME, etc)
- **Multi-tenant**: ✅ Bisa tapi harus setup wildcard DNS + Nginx

**DNS Setup untuk Multi-Tenant di VPS:**
```
yourdomain.com        A    YOUR_IP
www.yourdomain.com    CNAME yourdomain.com
*.yourdomain.com      A    YOUR_IP
```

---

## 📊 Infrastructure Comparison

### Replit Architecture
```
┌─────────────────────────────────┐
│     Your Replit Workspace       │
├─────────────────────────────────┤
│  • Node.js v20 (Pre-installed)  │
│  • PostgreSQL/Neon (Built-in)   │
│  • npm (Pre-installed)          │
│  • Terminal & Editor            │
└────────────────────┬────────────┘
                     │
          ┌──────────▼──────────┐
          │  Replit Infrastructure
          │  • Auto HTTPS
          │  • Domain: *.replit.dev
          │  • Load balancing
          │  • Auto scaling
          └──────────────────────┘
```

### VPS Architecture (Manual)
```
┌──────────────────────────────────────┐
│         Your VPS Server              │
├──────────────────────────────────────┤
│ Ubuntu OS                            │
│  ├─ Node.js v20 (manual install)    │
│  ├─ PostgreSQL (manual install)     │
│  ├─ Nginx (manual install)          │
│  ├─ PM2 (process manager)           │
│  ├─ Certbot (SSL management)        │
│  └─ Your Application Code           │
└────────────────┬─────────────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
┌───▼──┐  ┌──────▼──┐  ┌───────▼────┐
│ SSH  │  │ HTTP/80 │  │ HTTPS/443  │
│ :22  │  │(redirect)  │(Let's Encrypt)
└──────┘  └─────────┘  └────────────┘
```

---

## 🔄 Workflow Comparison

### Replit Development Workflow
1. ✅ Clone repo
2. ✅ Create database (UI click)
3. ✅ npm install
4. ✅ Run setup scripts
5. ✅ npm run dev
6. ✅ Access via https://domain.replit.dev
7. ✅ Auto restart on changes

### VPS Production Workflow
1. ✅ SSH ke server
2. ✅ Install Node.js, PostgreSQL, Nginx
3. ✅ Clone repo
4. ✅ Create .env file
5. ✅ Create PostgreSQL user & database
6. ✅ npm install
7. ✅ Run setup scripts
8. ✅ npm run build
9. ✅ Setup PM2
10. ✅ Setup Nginx
11. ✅ Setup SSL
12. ✅ Test & deploy
13. ✅ Setup monitoring

---

## 📝 Summary: Kapan Pakai Apa?

### Gunakan Replit Jika:
- ✅ Sedang development/testing
- ✅ Tidak perlu domain custom
- ✅ Tidak perlu scaling high
- ✅ Ingin setup cepat tanpa ops
- ✅ Server resources < 1000 users
- ✅ Budget terbatas untuk production

### Gunakan VPS Jika:
- ✅ Sudah production/live
- ✅ Butuh domain custom
- ✅ Butuh full control
- ✅ Scaling & performance penting
- ✅ Server resources > 1000 users
- ✅ Budget memungkinkan
- ✅ Team besar dengan ops engineer

---

## 🔗 Dokumentasi Lengkap

| File | Gunakan Untuk |
|------|---------------|
| **QUICKSTART.md** | Setup di Replit (development) |
| **DEPLOYMENT_VPS.md** | Setup di VPS/Server (production) |
| **SETUP_COMPARISON.md** | Perbandingan (file ini) |
| **DEPLOYMENT.md** | Netlify Functions setup (legacy) |
| **MULTI_TENANT_IMPLEMENTATION.md** | Technical details multi-tenant |

---

**Last Updated:** December 22, 2025
**Version:** 1.0
