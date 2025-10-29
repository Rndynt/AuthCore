# Client Application Environment Variables

Panduan environment variables untuk aplikasi yang mengkonsumsi Auth Service.

## 🔧 Environment Variables

### Untuk Frontend (React, Vue, Next.js, etc)

```env
# Auth Service URL
VITE_AUTH_SERVICE_URL=https://0xauthx0.netlify.app
# atau untuk Next.js / Create React App:
NEXT_PUBLIC_AUTH_SERVICE_URL=https://0xauthx0.netlify.app
REACT_APP_AUTH_SERVICE_URL=https://0xauthx0.netlify.app

# Your App URL (untuk CORS)
VITE_APP_URL=https://your-app.com
```

### Untuk Backend (Node.js, Python, Go, etc)

```env
# Auth Service URL
AUTH_SERVICE_URL=https://0xauthx0.netlify.app

# API Key (jika menggunakan service-to-service auth)
# Dapatkan dari: POST https://0xauthx0.netlify.app/api/auth/api-key/create
AUTH_API_KEY=your_api_key_here

# Session Cookie Name
SESSION_COOKIE_NAME=__Secure-better-auth.session_token

# CORS (tambahkan domain frontend Anda)
CORS_ORIGIN=https://your-frontend.com,https://admin.your-frontend.com
```

## 📝 Cara Mendapatkan API Key

1. Login ke auth service terlebih dahulu
2. Buat API key dengan request:

```bash
curl -X POST https://0xauthx0.netlify.app/api/auth/api-key/create \
  -H "Cookie: __Secure-better-auth.session_token=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production API Key",
    "expiresAt": "2026-12-31T23:59:59Z"
  }'
```

3. Save API key yang dikembalikan di environment variables

## 🔐 Security Notes

- ❌ Jangan commit `.env` ke Git
- ✅ Gunakan `.env.local` untuk development
- ✅ Set environment variables di hosting platform (Vercel, Netlify, etc)
- ✅ Rotate API keys secara berkala
- ✅ Gunakan different API keys untuk staging vs production

## 🌐 CORS Configuration

Jika aplikasi Anda di domain berbeda, pastikan domain Anda sudah ditambahkan ke `TRUSTED_ORIGINS` di Auth Service.

Hubungi administrator untuk menambahkan domain Anda ke whitelist.
