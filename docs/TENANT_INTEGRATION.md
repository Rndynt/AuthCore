# Panduan Integrasi Realmio untuk Tenant

Dokumen ini adalah panduan teknis bagi developer tenant (mis. Transity, KiosKoin) untuk
mengintegrasikan autentikasi dengan Realmio.

---

## Daftar Isi

- [Konsep Dasar](#konsep-dasar)
- [Konfigurasi Awal](#konfigurasi-awal)
- [API Reference](#api-reference)
- [Integrasi Next.js / React](#integrasi-nextjs--react)
- [Integrasi Backend Node.js / Express](#integrasi-backend-nodejs--express)
- [Menyimpan Data User di Database Tenant](#menyimpan-data-user-di-database-tenant)
- [Keamanan & CORS](#keamanan--cors)
- [Error Handling](#error-handling)

---

## Konsep Dasar

Realmio adalah **auth service terpusat**. Tenant tidak perlu membangun sistem login sendiri —
cukup arahkan request autentikasi ke Realmio.

```
Aplikasi Tenant (mis. Transity)
        │
        ├─► POST /api/auth/sign-in   → Realmio   (login)
        ├─► GET  /api/auth/get-session → Realmio  (cek sesi)
        │
        └─► Query database Transity sendiri       (data bisnis)
```

**Tenant diidentifikasi via header `X-Tenant-Id`** pada setiap request ke Realmio.

---

## Konfigurasi Awal

### 1. Hubungi Admin Realmio

Sebelum mulai, tenant ID kamu harus sudah terdaftar di Realmio. Admin akan memberikan:

| Info | Contoh |
|---|---|
| `REALMIO_BASE_URL` | `https://transity.realmio.web.id` |
| `REALMIO_TENANT_ID` | `transity-shuttle-terminal` |

### 2. Tambah ke Environment Variables Tenant

```env
# .env (di project tenant, bukan di Realmio)
REALMIO_BASE_URL=https://transity.realmio.web.id
REALMIO_TENANT_ID=transity-shuttle-terminal
```

Untuk frontend (Next.js / Vite), expose dengan prefix `NEXT_PUBLIC_` atau `VITE_`:

```env
NEXT_PUBLIC_REALMIO_URL=https://transity.realmio.web.id
NEXT_PUBLIC_REALMIO_TENANT_ID=transity-shuttle-terminal
```

### 3. Daftarkan Domain ke CORS

Minta admin Realmio untuk menambahkan domain aplikasi kamu ke `TRUSTED_ORIGINS`.
Contoh: `https://transity.app`, `https://staging.transity.app`.

Tanpa ini, browser akan memblokir request dengan `credentials: "include"`.

---

## API Reference

**Base URL:** `https://transity.realmio.web.id`

Header wajib pada **setiap** request:
```
X-Tenant-Id: transity-shuttle-terminal
Content-Type: application/json
```

### Endpoint Utama

| Endpoint | Method | Auth | Deskripsi |
|---|---|---|---|
| `/api/auth/sign-up/email` | POST | Tidak | Registrasi user baru |
| `/api/auth/sign-in/email` | POST | Tidak | Login |
| `/api/auth/sign-out` | POST | Ya | Logout |
| `/api/auth/get-session` | GET | Ya | Cek sesi aktif |
| `/api/auth/list-sessions` | GET | Ya | Semua sesi user |
| `/api/auth/update-user` | POST | Ya | Update profil |
| `/api/auth/change-password` | POST | Ya | Ganti password |
| `/api/auth/delete-user` | POST | Ya | Hapus akun |
| `/api/auth/api-key/create` | POST | Ya | Buat API key |
| `/api/auth/api-key/list` | GET | Ya | List API key |
| `/api/auth/api-key/revoke` | POST | Ya | Hapus API key |
| `/api/auth/.well-known/jwks.json` | GET | Tidak | JWKS untuk verifikasi JWT |
| `/me` | GET | Ya | Sesi + info tenant |

### Sign Up

```bash
curl -X POST https://transity.realmio.web.id/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: transity-shuttle-terminal" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "name": "Budi Santoso"
  }'
```

**Response:**
```json
{
  "token": "QWRSQDKBuIkd7DRolYlDy2j...",
  "user": {
    "id": "79YdO3inqONRBEyW5cUs4P1X",
    "email": "user@example.com",
    "name": "Budi Santoso",
    "emailVerified": false,
    "createdAt": "2026-03-30T17:20:13.073Z",
    "role": "user"
  }
}
```

### Sign In

```bash
curl -X POST https://transity.realmio.web.id/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: transity-shuttle-terminal" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

### Get Session

```bash
curl https://transity.realmio.web.id/api/auth/get-session \
  -H "X-Tenant-Id: transity-shuttle-terminal" \
  -H "Authorization: Bearer TOKEN_DISINI"
```

**Response:**
```json
{
  "session": {
    "id": "...",
    "expiresAt": "2026-04-06T17:20:13.073Z",
    "token": "..."
  },
  "user": {
    "id": "79YdO3inqONRBEyW5cUs4P1X",
    "email": "user@example.com",
    "name": "Budi Santoso",
    "role": "user"
  }
}
```

---

## Integrasi Next.js / React

### Langkah 1 — Buat Realmio Client (`lib/realmio.ts`)

```typescript
const REALMIO_URL  = process.env.NEXT_PUBLIC_REALMIO_URL!;
const TENANT_ID    = process.env.NEXT_PUBLIC_REALMIO_TENANT_ID!;

const defaultHeaders = {
  "Content-Type":  "application/json",
  "X-Tenant-Id":   TENANT_ID,
};

async function realmioFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${REALMIO_URL}${path}`, {
    ...init,
    credentials: "include",        // wajib untuk cookies
    headers: {
      ...defaultHeaders,
      ...init.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.message ?? "Auth error"), { status: res.status, data: err });
  }

  return res.json();
}

export const realmio = {
  signUp: (email: string, password: string, name: string) =>
    realmioFetch("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),

  signIn: (email: string, password: string) =>
    realmioFetch("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  signOut: () =>
    realmioFetch("/api/auth/sign-out", { method: "POST" }),

  getSession: () =>
    realmioFetch("/api/auth/get-session"),
};
```

### Langkah 2 — Auth Context (`context/AuthContext.tsx`)

```typescript
"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { realmio } from "@/lib/realmio";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    realmio.getSession()
      .then((data) => setUser(data?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = async (email: string, password: string) => {
    const data = await realmio.signIn(email, password);
    setUser(data.user);
  };

  const signUp = async (email: string, password: string, name: string) => {
    const data = await realmio.signUp(email, password, name);
    setUser(data.user);
  };

  const signOut = async () => {
    await realmio.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
```

### Langkah 3 — Wrap di Root Layout

```typescript
// app/layout.tsx
import { AuthProvider } from "@/context/AuthContext";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

### Langkah 4 — Protected Route

```typescript
// components/ProtectedRoute.tsx
"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) return <div>Loading...</div>;
  if (!user)   return null;

  return <>{children}</>;
}
```

### Langkah 5 — Halaman Login

```typescript
// app/login/page.tsx
"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const { signIn } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await signIn(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message ?? "Login gagal");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="email"    value={email}    onChange={(e) => setEmail(e.target.value)}    placeholder="Email"    required />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
      {error && <p style={{ color: "red" }}>{error}</p>}
      <button type="submit">Login</button>
    </form>
  );
}
```

---

## Integrasi Backend Node.js / Express

Untuk **server-side validation** (mis. API route yang butuh memastikan user sudah login):

### Auth Middleware (`middleware/auth.ts`)

```typescript
import { Request, Response, NextFunction } from "express";

const REALMIO_URL = process.env.REALMIO_BASE_URL!;
const TENANT_ID   = process.env.REALMIO_TENANT_ID!;

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  // Ambil token dari cookie atau Authorization header
  const cookieHeader = req.headers.cookie ?? "";
  const bearerToken  = req.headers.authorization;

  const headers: Record<string, string> = {
    "X-Tenant-Id": TENANT_ID,
  };

  if (cookieHeader) headers["Cookie"]        = cookieHeader;
  if (bearerToken)  headers["Authorization"] = bearerToken;

  try {
    const response = await fetch(`${REALMIO_URL}/api/auth/get-session`, { headers });

    if (!response.ok) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await response.json();

    if (!data?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = data.user;
    next();
  } catch {
    res.status(401).json({ error: "Auth service unreachable" });
  }
}

// Middleware khusus role tertentu
export function requireRole(role: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
```

### Penggunaan di Routes

```typescript
import express from "express";
import { requireAuth, requireRole } from "./middleware/auth";

const app = express();

// Route publik
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Route butuh login
app.get("/api/bookings", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  // query database transity sendiri dengan userId
  const bookings = await db.booking.findMany({ where: { userId } });
  res.json({ bookings });
});

// Route butuh role admin
app.delete("/api/bookings/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await db.booking.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
```

---

## Menyimpan Data User di Database Tenant

Realmio hanya menyimpan data autentikasi. Data bisnis (profil lengkap, riwayat pemesanan, dll.)
disimpan di **database milik tenant sendiri**, menggunakan `user.id` dari Realmio sebagai penghubung.

### Skema Database Tenant (Contoh Prisma)

```prisma
model UserProfile {
  id            String   @id @default(cuid())
  userId        String   @unique          // ← ID dari Realmio
  phone         String?
  address       String?
  idNumber      String?
  passengerType String   @default("reguler")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Booking {
  id         String   @id @default(cuid())
  userId     String                        // ← ID dari Realmio
  routeId    String
  seatNumber String?
  status     String   @default("pending")
  createdAt  DateTime @default(now())
}
```

### Buat Profil Saat Register (`POST /api/auth/register`)

```typescript
// Di backend Transity, setelah user berhasil register via Realmio:
app.post("/api/register", async (req, res) => {
  const { email, password, name, phone } = req.body;

  // 1. Register ke Realmio
  const realmioRes = await fetch(`${REALMIO_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-Id": TENANT_ID,
    },
    body: JSON.stringify({ email, password, name }),
  });

  if (!realmioRes.ok) {
    const err = await realmioRes.json();
    return res.status(realmioRes.status).json(err);
  }

  const { user, token } = await realmioRes.json();

  // 2. Simpan profil tambahan di database Transity
  await db.userProfile.create({
    data: {
      userId: user.id,   // ← pakai ID dari Realmio
      phone,
    },
  });

  // 3. Return ke client
  res.json({ user, token });
});
```

### Ambil Profil User yang Sudah Login

```typescript
app.get("/api/profile", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  // Data dari Realmio sudah ada di req.user (nama, email)
  // Data tambahan ambil dari DB Transity
  const profile = await db.userProfile.findUnique({ where: { userId } });

  res.json({
    ...req.user,         // nama, email, role dari Realmio
    phone:   profile?.phone,
    address: profile?.address,
  });
});
```

---

## Keamanan & CORS

### Konfigurasi CORS di Sisi Aplikasi Tenant (Next.js)

Kalau frontend dan backend tenant berbeda domain, tambahkan header berikut di Next.js API route:

```typescript
// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: process.env.NEXT_PUBLIC_APP_URL! },
        ],
      },
    ];
  },
};

export default nextConfig;
```

### Pengiriman Token

Ada dua cara mengirim token ke Realmio:

| Cara | Header | Kapan dipakai |
|---|---|---|
| Cookie | Otomatis (browser) | Web app dengan `credentials: "include"` |
| Bearer | `Authorization: Bearer <token>` | Mobile app, API client, backend-to-backend |

Untuk **mobile app** atau situasi di mana cookie tidak bisa dipakai, simpan token dari response
`sign-in` dan kirim sebagai Bearer:

```typescript
// React Native / mobile
const { token } = await signIn(email, password);
await AsyncStorage.setItem("auth_token", token);

// Setiap request berikutnya:
const token = await AsyncStorage.getItem("auth_token");
fetch(`${REALMIO_URL}/api/auth/get-session`, {
  headers: {
    "Authorization": `Bearer ${token}`,
    "X-Tenant-Id": TENANT_ID,
  },
});
```

---

## Error Handling

### Format Error dari Realmio

```json
{ "code": "INVALID_EMAIL_OR_PASSWORD", "message": "Invalid email or password" }
{ "code": "USER_ALREADY_EXISTS",        "message": "User already exists" }
{ "code": "TENANT_NOT_FOUND",           "message": "Tenant 'xyz' not found or inactive" }
```

### HTTP Status Codes

| Status | Arti | Tindakan |
|---|---|---|
| `400` | Request tidak valid | Cek body / format |
| `401` | Tidak terautentikasi | Redirect ke halaman login |
| `403` | Tidak punya akses | Tampilkan pesan "Akses ditolak" |
| `404` | Tenant tidak ditemukan | Cek `X-Tenant-Id` |
| `429` | Terlalu banyak request | Tunggu dan retry dengan backoff |
| `500` | Error Realmio | Tampilkan pesan umum, coba lagi nanti |

### Contoh Error Handler (React)

```typescript
async function handleAuthError(err: any) {
  switch (err.status) {
    case 401:
      router.push("/login");
      break;
    case 429:
      toast.error("Terlalu banyak percobaan. Tunggu beberapa saat.");
      break;
    case 400:
      toast.error(err.data?.message ?? "Data tidak valid.");
      break;
    default:
      toast.error("Terjadi kesalahan. Coba lagi nanti.");
  }
}
```

---

## Checklist Integrasi

- [ ] Tenant ID sudah terdaftar di Realmio
- [ ] `REALMIO_BASE_URL` dan `REALMIO_TENANT_ID` sudah di-set di env
- [ ] Domain tenant sudah didaftarkan ke `TRUSTED_ORIGINS` Realmio
- [ ] Semua request ke Realmio menyertakan header `X-Tenant-Id`
- [ ] Frontend menggunakan `credentials: "include"` untuk cookie
- [ ] Backend middleware memvalidasi sesi via Realmio sebelum proses request
- [ ] Tabel `user_profiles` (atau sejenisnya) di DB tenant menggunakan `userId` dari Realmio
- [ ] Error handling sudah diimplementasi untuk kasus 401, 429, 500

---

*Terakhir diperbarui: 2026-03-30*
*Realmio versi: 1.x — Better Auth 1.x + Fastify 5*
