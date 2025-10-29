# ⚡ Quick Start Guide

Panduan cepat untuk mulai menggunakan Auth Service dalam 5 menit.

## 🎯 Test Auth Service (Tanpa Code)

### 1. Sign Up User Baru
```bash
curl -X POST https://0xauthx0.netlify.app/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "yourname@example.com",
    "password": "YourSecurePass123!",
    "name": "Your Name"
  }'
```

**Expected Response:**
```json
{
  "token": "abc123...",
  "user": {
    "id": "user_id",
    "email": "yourname@example.com",
    "name": "Your Name"
  }
}
```

### 2. Login (Sign In)
```bash
curl -X POST https://0xauthx0.netlify.app/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "yourname@example.com",
    "password": "YourSecurePass123!"
  }'
```

### 3. Check Session
```bash
curl https://0xauthx0.netlify.app/api/auth/get-session \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## 🚀 Integrasi ke Aplikasi

### React (Vite) - 3 Langkah

**Step 1:** Install axios
```bash
npm install axios
```

**Step 2:** Copy file example
```bash
# Download dari repository
curl -o src/auth.jsx https://raw.githubusercontent.com/your-repo/examples/react-example.jsx
```

**Step 3:** Wrap aplikasi dengan AuthProvider
```jsx
// main.jsx
import { AuthProvider } from './auth';

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
```

**Step 4:** Gunakan di component
```jsx
import { useAuth } from './auth';

function MyComponent() {
  const { user, signIn, signOut } = useAuth();
  
  if (user) {
    return <div>Welcome {user.name}! <button onClick={signOut}>Logout</button></div>;
  }
  
  return <button onClick={() => signIn('email@example.com', 'password')}>Login</button>;
}
```

---

### Node.js Backend - 2 Langkah

**Step 1:** Install dependencies
```bash
npm install axios cookie-parser
```

**Step 2:** Add middleware
```javascript
const axios = require('axios');

async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  try {
    const response = await axios.get(
      'https://0xauthx0.netlify.app/api/auth/get-session',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    req.user = response.data.user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Gunakan di route
app.get('/protected', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});
```

---

## 📱 Postman Testing

**Import Postman Collection:**
1. Download: `postman-collection.json` dari folder `examples/`
2. Import ke Postman
3. Set environment variable `baseUrl` = `https://0xauthx0.netlify.app/api/auth`
4. Run collection!

---

## 🔑 Authentication Methods

| Method | Use Case | Example |
|--------|----------|---------|
| **Cookie** | Web apps (same domain) | Browser auto-sends cookie |
| **Bearer Token** | Mobile apps, SPAs | `Authorization: Bearer {token}` |
| **API Key** | Backend services | `x-api-key: {key}` |
| **JWT** | Microservices | Verify with JWKS |

---

## 📚 Dokumentasi Lengkap

- **Full Integration Guide:** `INTEGRATION_GUIDE.md`
- **React Example:** `examples/react-example.jsx`
- **Node.js Example:** `examples/nodejs-middleware.js`
- **Postman Collection:** `examples/postman-collection.json`

---

## 🆘 Troubleshooting

### CORS Error
**Problem:** Browser blocks request with CORS error  
**Solution:** Pastikan domain Anda ada di `TRUSTED_ORIGINS`. Hubungi admin.

### 401 Unauthorized
**Problem:** Session token invalid atau expired  
**Solution:** Login ulang untuk mendapatkan session baru

### 500 Internal Server Error
**Problem:** Server error  
**Solution:** Check Netlify function logs atau hubungi support

---

## 🎉 Next Steps

1. ✅ Test dengan curl atau Postman
2. ✅ Integrate ke aplikasi Anda
3. ✅ Setup environment variables
4. ✅ Deploy ke production
5. ✅ Monitor dan scale!

**Auth Service URL:** https://0xauthx0.netlify.app

**Status:** ✅ Production Ready | 🚀 High Performance | 🔒 Secure
