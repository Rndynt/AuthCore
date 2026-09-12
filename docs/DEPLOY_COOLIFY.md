# Deploy ke Coolify via Dockerfile

Panduan ini khusus untuk kasus: Coolify **tidak memakai Dockerfile** dan malah
build pakai **Nixpacks** (auto-detect), sehingga deploy gagal atau hasilnya
tidak sesuai.

Dockerfile yang dipakai: **`Dockerfile` di root repo** (bukan
`admin-ui/Dockerfile.legacy-unused` — file itu sudah tidak dipakai sejak
admin-ui digabung jadi static export di dalam container yang sama).

---

## Kenapa Coolify bisa pakai Nixpacks padahal ada Dockerfile

Coolify **tidak otomatis** memakai Dockerfile hanya karena filenya ada di
repo. Build Pack harus **dipilih manual** di UI. Kalau resource dibuat lewat
"New Resource → Public/Private Repository" dan Build Pack tidak diubah,
defaultnya adalah **Nixpacks**, dan Coolify akan mengabaikan Dockerfile sama
sekali — build jadi tebakan otomatis dari Nixpacks, bukan dari Dockerfile ini.

Penyebab lain yang sering bikin gagal walau sudah pilih Dockerfile:
- **Base Directory** tidak di-set ke `/` (root), sehingga Coolify mencari
  Dockerfile di path yang salah pada monorepo ini.
- **Dockerfile Location** tidak di-set ke `Dockerfile` (relatif ke Base
  Directory).
- Ada lebih dari satu file Dockerfile di repo dan yang terpilih salah.

---

## Langkah Setup di Coolify

### 1. Buat/edit resource

Di project Coolify:

1. **New Resource** → **Docker** → **Dockerfile** (bukan "Public Repository"
   dengan Nixpacks default, dan bukan "Docker Compose").
   - Kalau resource sudah kadung dibuat dengan Nixpacks: buka resource →
     **General** → cari field **Build Pack** → ubah dari `nixpacks` ke
     **`Dockerfile`**.
2. **Source**: hubungkan ke repo `Rndynt/realmio-auth`, branch **`multi-tenant`**.

### 2. Set path build di tab General

| Field | Nilai |
|---|---|
| Build Pack | `Dockerfile` |
| Base Directory | `/` |
| Dockerfile Location | `Dockerfile` |
| Docker Build Stage (target) | kosongkan (pakai stage terakhir: `runtime`) |
| Ports Exposes | `5000` |
| Health Check Path | `/healthz` |
| Health Check Port | `5000` |

Kalau ada field "Custom Docker Options" atau "Watch Paths", tidak perlu diisi.

### 3. Environment Variables

Kamu sudah set semua env var — pastikan minimal 4 ini ada dan **tanpa
kutip/spasi tambahan** di value-nya (kutip literal `"..."` akan ikut
ke-parse sebagai bagian dari string oleh aplikasi):

```
DATABASE_URL=postgresql://user:pass@host:5432/dbname
BETTER_AUTH_SECRET=<random string minimal 24 karakter, JANGAN pakai nilai default repo>
BETTER_AUTH_URL=https://domain-kamu.com
TRUSTED_ORIGINS=https://domain-kamu.com
```

Catatan penting terkait kode aplikasi (`packages/config/src/env.ts`):
- Kalau `NODE_ENV=production` dan `BETTER_AUTH_SECRET` masih nilai default
  bawaan repo, **aplikasi langsung `throw` saat start** — container akan
  crash-loop. Pastikan secret sudah diganti dengan nilai unik kamu sendiri.
- `DATABASE_URL` wajib valid dan **bisa dijangkau dari container** saat
  start-up, karena aplikasi langsung query tabel `tenants` untuk load tenant
  registry sebelum server mulai listen. Kalau DB unreachable atau migrasi
  belum jalan (tabel belum ada), proses akan exit dengan kode 1.
- `PORT` tidak perlu di-set manual — default `5000`, sudah cocok dengan
  `EXPOSE 5000` dan health check di Dockerfile. Kalau Coolify auto-inject
  `PORT` dari sisi platform, biarkan saja karena kode ini membaca `PORT`
  dari environment.

### 4. Jalankan migrasi database SEBELUM deploy pertama

Dockerfile ini **tidak** menjalankan migrasi Prisma otomatis saat start
(dan sebaiknya memang begitu, supaya migrasi tidak race dengan multiple
replicas). Jalankan manual sekali dari mesin lokal atau dari terminal
Coolify **sebelum** deploy pertama:

```bash
DATABASE_URL="postgresql://user:pass@host:5432/dbname" npx prisma migrate deploy
```

Kalau tabel `tenants` belum ada saat container start, aplikasi akan
crash-loop dengan error `Failed to initialize tenant registry` di log.

### 5. Deploy

Klik **Deploy**. Build memakan waktu karena monorepo (install root +
admin-ui, compile TypeScript, Next.js static export). Pantau log build —
kalau sudah benar memakai Dockerfile, log akan menampilkan step-step seperti:

```
Step 1/... : FROM node:20-alpine AS deps
Step 2/... : RUN apk add --no-cache openssl curl
...
```

Kalau log malah menampilkan proses `nixpacks build` atau deteksi
"Node.js app detected", berarti Build Pack **masih salah** — kembali ke
langkah 2.

### 6. Verifikasi setelah deploy sukses

```bash
curl https://domain-kamu.com/healthz
# {"status":"ok",...}

curl -I https://domain-kamu.com/admin
# HTTP/1.1 200 OK
```

---

## Troubleshooting cepat

| Gejala | Penyebab kemungkinan | Solusi |
|---|---|---|
| Log build menunjukkan Nixpacks, bukan Dockerfile steps | Build Pack masih `nixpacks` | Ubah ke `Dockerfile` di General settings, lalu redeploy |
| Build gagal "Dockerfile not found" | Base Directory / Dockerfile Location salah | Set Base Directory `/`, Dockerfile Location `Dockerfile` |
| Container langsung restart terus (crash-loop) | `BETTER_AUTH_SECRET` masih default, atau `DATABASE_URL` salah/unreachable, atau tabel `tenants` belum ada | Cek log container di Coolify; jalankan `prisma migrate deploy`; ganti secret |
| `/healthz` timeout terus, container "unhealthy" | DB tidak reachable dari container (firewall/network Coolify) | Test dari dalam container: `docker exec <container> curl -v http://localhost:5000/healthz`; cek `DATABASE_URL` bisa diakses dari jaringan VPS |
| `/admin` 404 atau blank | Build admin-ui gagal di stage `build`, cek log build bagian `npm run build` | Build ulang, lihat error TypeScript/Next.js di log build lengkap |
| Deploy sukses tapi domain tidak kebuka | Proxy/domain di Coolify belum diarahkan ke port 5000 | Cek tab **Domains** di resource, pastikan target port `5000` |

---

## Referensi

- Dockerfile: `Dockerfile` (root)
- Panduan Docker umum (VPS manual + Nginx, tanpa Coolify UI): `docs/DEPLOY_VPS_DOCKER.md`
- Environment variable & validasi: `packages/config/src/env.ts`
- Skrip seed admin (jangan insert user manual via SQL): `scripts/seed-admin.ts`
