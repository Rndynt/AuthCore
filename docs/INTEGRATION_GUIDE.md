# 🔐 Realmio Integration Guide

Panduan lengkap untuk mengintegrasikan aplikasi Anda dengan Realmio di **https://0xauthx0.netlify.app**

---

## 📋 Daftar Isi

- [Quick Start](#quick-start)
- [Authentication Methods](#authentication-methods)
- [Frontend Integration](#frontend-integration)
- [Backend Integration](#backend-integration)
- [API Reference](#api-reference)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)

---

## 🚀 Quick Start

### Base URL
```
https://0xauthx0.netlify.app
```

### Authentication Methods Available
- ✅ Email/Password Authentication
- ✅ Session-based (Cookies)
- ✅ JWT Tokens
- ✅ Bearer Tokens
- ✅ API Keys (Service-to-Service)

---

## 🔑 Authentication Methods

### 1. Email/Password Authentication (Cookie-based)

Metode ini menggunakan HTTP-only cookies untuk menyimpan session secara aman.

#### Sign Up
```bash
curl -X POST https://0xauthx0.netlify.app/.netlify/functions/tenant-auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "name": "John Doe"
  }'
```

**Response:**
```json
{
  "token": "4NH4krtHTl2ol1FVKADADHjCYVxxO019",
  "user": {
    "id": "BBf67beTNNrElC7jGE9HxREUJJgfDcgI",
    "email": "user@example.com",
    "name": "John Doe",
    "emailVerified": false,
    "createdAt": "2025-10-29T09:17:01.335Z"
  }
}
```

#### Sign In
```bash
curl -X POST https://0xauthx0.netlify.app/.netlify/functions/tenant-auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'
```

#### Get Current Session
```bash
curl https://0xauthx0.netlify.app/.netlify/functions/tenant-auth/get-session \
  -H "Cookie: __Secure-better-auth.session_token=YOUR_SESSION_TOKEN"
```

#### Sign Out
```bash
curl -X POST https://0xauthx0.netlify.app/.netlify/functions/tenant-auth/sign-out \
  -H "Cookie: __Secure-better-auth.session_token=YOUR_SESSION_TOKEN"
```

---

### 2. JWT Token Authentication

JWT tokens berguna untuk stateless authentication atau microservices.

#### Get JWT Token (setelah login)
```bash
curl https://0xauthx0.netlify.app/.netlify/functions/tenant-auth/get-session \
  -H "Cookie: __Secure-better-auth.session_token=YOUR_SESSION_TOKEN"
```

**Response Headers:**
```
set-auth-jwt: eyJhbGciOiJFZERTQSIsImtpZCI6IjlBV2o5ajQzM25MenZmOThmMjg3dE9GNjh4a2R5S2RWIn0...
```

#### Verify JWT Token
Endpoint untuk mendapatkan JWKS (JSON Web Key Set) untuk memverifikasi JWT:
```bash
curl https://0xauthx0.netlify.app/.netlify/functions/tenant-auth/.well-known/jwks.json
```

---

### 3. Bearer Token Authentication

Bearer tokens dapat digunakan untuk API calls dari aplikasi mobile atau SPA.

#### Menggunakan Bearer Token
```bash
curl https://0xauthx0.netlify.app/.netlify/functions/tenant-auth/list-sessions \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

---

### 4. API Key Authentication (Service-to-Service)

API Keys cocok untuk komunikasi antar backend services.

#### Create API Key (harus authenticated)
```bash
curl -X POST https://0xauthx0.netlify.app/.netlify/functions/tenant-auth/api-key/create \
  -H "Cookie: __Secure-better-auth.session_token=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Service API Key",
    "expiresAt": "2026-12-31T23:59:59Z"
  }'
```

#### List API Keys
```bash
curl https://0xauthx0.netlify.app/.netlify/functions/tenant-auth/api-key/list \
  -H "Cookie: __Secure-better-auth.session_token=YOUR_SESSION_TOKEN"
```

#### Delete API Key
```bash
curl -X POST https://0xauthx0.netlify.app/.netlify/functions/tenant-auth/api-key/revoke \
  -H "Cookie: __Secure-better-auth.session_token=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "API_KEY_ID"
  }'
```

#### Menggunakan API Key
```bash
curl https://0xauthx0.netlify.app/.netlify/functions/tenant-auth/get-session \
  -H "x-api-key: YOUR_API_KEY"
```

---

## 💻 Frontend Integration

### React / Next.js

#### 1. Install Dependencies
```bash
npm install axios
```

#### 2. Create Realmio (utils/authService.js)
```javascript
import axios from 'axios';

const AUTH_BASE_URL = 'https://0xauthx0.netlify.app/.netlify/functions/tenant-auth';

const authAPI = axios.create({
  baseURL: AUTH_BASE_URL,
  withCredentials: true, // Important untuk cookies
  headers: {
    'Content-Type': 'application/json',
  }
});

export const authService = {
  // Sign Up
  async signUp(email, password, name) {
    const response = await authAPI.post('/sign-up/email', {
      email,
      password,
      name
    });
    return response.data;
  },

  // Sign In
  async signIn(email, password) {
    const response = await authAPI.post('/sign-in/email', {
      email,
      password
    });
    return response.data;
  },

  // Get Current Session
  async getSession() {
    const response = await authAPI.get('/get-session');
    return response.data;
  },

  // Sign Out
  async signOut() {
    const response = await authAPI.post('/sign-out');
    return response.data;
  },

  // List Sessions
  async listSessions() {
    const response = await authAPI.get('/list-sessions');
    return response.data;
  }
};
```

#### 3. Create Auth Context (context/AuthContext.jsx)
```javascript
import { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../utils/authService';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const session = await authService.getSession();
      if (session?.user) {
        setUser(session.user);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const data = await authService.signIn(email, password);
    setUser(data.user);
    return data;
  };

  const signup = async (email, password, name) => {
    const data = await authService.signUp(email, password, name);
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    await authService.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

#### 4. Setup di App.jsx / _app.js
```javascript
import { AuthProvider } from './context/AuthContext';

function App() {
  return (
    <AuthProvider>
      {/* Your app components */}
    </AuthProvider>
  );
}
```

#### 5. Contoh Login Component
```javascript
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      // Redirect to dashboard
    } catch (error) {
      alert('Login failed: ' + error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
      />
      <button type="submit">Login</button>
    </form>
  );
}
```

#### 6. Protected Route Component
```javascript
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return children;
}
```

---

### Vue.js

#### 1. Create Realmio (services/authService.js)
```javascript
import axios from 'axios';

const AUTH_BASE_URL = 'https://0xauthx0.netlify.app/.netlify/functions/tenant-auth';

const authAPI = axios.create({
  baseURL: AUTH_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  }
});

export default {
  signUp(email, password, name) {
    return authAPI.post('/sign-up/email', { email, password, name });
  },

  signIn(email, password) {
    return authAPI.post('/sign-in/email', { email, password });
  },

  getSession() {
    return authAPI.get('/get-session');
  },

  signOut() {
    return authAPI.post('/sign-out');
  }
};
```

#### 2. Create Pinia Store (stores/auth.js)
```javascript
import { defineStore } from 'pinia';
import authService from '@/services/authService';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    loading: false,
  }),

  getters: {
    isAuthenticated: (state) => !!state.user,
  },

  actions: {
    async checkAuth() {
      try {
        const response = await authService.getSession();
        this.user = response.data?.user || null;
      } catch (error) {
        this.user = null;
      }
    },

    async login(email, password) {
      this.loading = true;
      try {
        const response = await authService.signIn(email, password);
        this.user = response.data.user;
        return response.data;
      } finally {
        this.loading = false;
      }
    },

    async signup(email, password, name) {
      this.loading = true;
      try {
        const response = await authService.signUp(email, password, name);
        this.user = response.data.user;
        return response.data;
      } finally {
        this.loading = false;
      }
    },

    async logout() {
      await authService.signOut();
      this.user = null;
    },
  },
});
```

---

### Flutter / React Native (Mobile)

#### React Native Example
```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_BASE_URL = 'https://0xauthx0.netlify.app/.netlify/functions/tenant-auth';

class AuthService {
  async signUp(email, password, name) {
    const response = await fetch(`${AUTH_BASE_URL}/sign-up/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ email, password, name }),
    });
    
    const data = await response.json();
    
    // Store token
    if (data.token) {
      await AsyncStorage.setItem('auth_token', data.token);
    }
    
    return data;
  }

  async signIn(email, password) {
    const response = await fetch(`${AUTH_BASE_URL}/sign-in/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    
    const data = await response.json();
    
    if (data.token) {
      await AsyncStorage.setItem('auth_token', data.token);
    }
    
    return data;
  }

  async getSession() {
    const token = await AsyncStorage.getItem('auth_token');
    
    const response = await fetch(`${AUTH_BASE_URL}/get-session`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    return response.json();
  }

  async signOut() {
    await AsyncStorage.removeItem('auth_token');
    
    await fetch(`${AUTH_BASE_URL}/sign-out`, {
      method: 'POST',
    });
  }
}

export default new AuthService();
```

---

## 🔧 Backend Integration

### Node.js / Express

#### 1. Auth Middleware
```javascript
const axios = require('axios');

const AUTH_BASE_URL = 'https://0xauthx0.netlify.app/.netlify/functions/tenant-auth';

async function authMiddleware(req, res, next) {
  try {
    // Get token from cookie or Authorization header
    const token = req.cookies['__Secure-better-auth.session_token'] ||
                  req.headers.authorization?.replace('Bearer ', '') ||
                  req.headers['x-api-key'];

    if (!token) {
      return res.status(401).json({ error: 'No authentication token' });
    }

    // Verify session with auth service
    const response = await axios.get(`${AUTH_BASE_URL}/get-session`, {
      headers: {
        Cookie: `__Secure-better-auth.session_token=${token}`,
        'x-api-key': req.headers['x-api-key'],
        Authorization: req.headers.authorization,
      },
    });

    if (response.data?.user) {
      req.user = response.data.user;
      req.session = response.data.session;
      next();
    } else {
      res.status(401).json({ error: 'Invalid session' });
    }
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

module.exports = authMiddleware;
```

#### 2. Usage
```javascript
const express = require('express');
const authMiddleware = require('./middleware/auth');

const app = express();

// Protected route
app.get('/api/protected', authMiddleware, (req, res) => {
  res.json({
    message: 'This is protected data',
    user: req.user,
  });
});
```

---

### Python / FastAPI

```python
from fastapi import FastAPI, Depends, HTTPException, Header
import httpx

AUTH_BASE_URL = "https://0xauthx0.netlify.app/.netlify/functions/tenant-auth"

async def get_current_user(
    authorization: str = Header(None),
    x_api_key: str = Header(None),
):
    headers = {}
    
    if authorization:
        headers["Authorization"] = authorization
    elif x_api_key:
        headers["x-api-key"] = x_api_key
    else:
        raise HTTPException(status_code=401, detail="No authentication provided")
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{AUTH_BASE_URL}/get-session",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            if data and "user" in data:
                return data["user"]
        
        raise HTTPException(status_code=401, detail="Invalid authentication")

app = FastAPI()

@app.get("/protected")
async def protected_route(user = Depends(get_current_user)):
    return {
        "message": "This is protected data",
        "user": user
    }
```

---

### Go

```go
package main

import (
    "encoding/json"
    "net/http"
)

const AuthBaseURL = "https://0xauthx0.netlify.app/.netlify/functions/tenant-auth"

type User struct {
    ID    string `json:"id"`
    Email string `json:"email"`
    Name  string `json:"name"`
}

type SessionResponse struct {
    User User `json:"user"`
}

func AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Get token from header
        token := r.Header.Get("Authorization")
        apiKey := r.Header.Get("x-api-key")
        
        if token == "" && apiKey == "" {
            http.Error(w, "Unauthorized", http.StatusUnauthorized)
            return
        }
        
        // Verify with auth service
        req, _ := http.NewRequest("GET", AuthBaseURL+"/get-session", nil)
        if token != "" {
            req.Header.Set("Authorization", token)
        }
        if apiKey != "" {
            req.Header.Set("x-api-key", apiKey)
        }
        
        client := &http.Client{}
        resp, err := client.Do(req)
        if err != nil || resp.StatusCode != 200 {
            http.Error(w, "Unauthorized", http.StatusUnauthorized)
            return
        }
        defer resp.Body.Close()
        
        var session SessionResponse
        json.NewDecoder(resp.Body).Decode(&session)
        
        // Add user to context and continue
        next(w, r)
    }
}
```

---

## 📚 API Reference

### Authentication Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/auth/sign-up/email` | POST | Create new user | No |
| `/api/auth/sign-in/email` | POST | Login user | No |
| `/api/auth/sign-out` | POST | Logout user | Yes |
| `/api/auth/get-session` | GET | Get current session | Yes |
| `/api/auth/list-sessions` | GET | List all user sessions | Yes |

### User Management

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/auth/user` | GET | Get user profile | Yes |
| `/api/auth/user/update` | POST | Update user profile | Yes |
| `/api/auth/user/change-password` | POST | Change password | Yes |
| `/api/auth/user/delete` | POST | Delete account | Yes |

### API Key Management

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/auth/api-key/create` | POST | Create API key | Yes |
| `/api/auth/api-key/list` | GET | List API keys | Yes |
| `/api/auth/api-key/revoke` | POST | Revoke API key | Yes |

### Organization Management

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/auth/organization/create` | POST | Create organization | Yes |
| `/api/auth/organization/list` | GET | List organizations | Yes |
| `/api/auth/organization/get-active` | GET | Get active org | Yes |
| `/api/auth/organization/set-active` | POST | Set active org | Yes |

### JWT & JWKS

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/auth/.well-known/jwks.json` | GET | Get JWKS for JWT verification | No |

---

## ⚠️ Error Handling

### Common Error Responses

```javascript
// 401 Unauthorized
{
  "error": "unauthorized",
  "message": "Authentication required"
}

// 400 Bad Request
{
  "error": "validation_error",
  "message": "Invalid email or password"
}

// 409 Conflict
{
  "error": "user_exists",
  "message": "User with this email already exists"
}

// 500 Internal Server Error
{
  "error": "internal_error",
  "message": "Something went wrong"
}
```

### Error Handling Example (JavaScript)
```javascript
try {
  await authService.signIn(email, password);
} catch (error) {
  if (error.response) {
    switch (error.response.status) {
      case 401:
        alert('Invalid email or password');
        break;
      case 409:
        alert('User already exists');
        break;
      case 500:
        alert('Server error, please try again later');
        break;
      default:
        alert('An error occurred');
    }
  } else {
    alert('Network error');
  }
}
```

---

## 🛡️ Best Practices

### Security

1. **Always use HTTPS** - Auth service sudah enforce HTTPS
2. **Never store passwords** - Gunakan session tokens
3. **Set secure cookies** - Cookies sudah HttpOnly & Secure
4. **Implement CORS properly** - Tambahkan domain Anda ke TRUSTED_ORIGINS
5. **Use API Keys for backend** - Jangan gunakan user credentials di backend

### Performance

1. **Cache user data** - Simpan session di local state/storage
2. **Refresh tokens** - Implementasi token refresh untuk UX yang baik
3. **Lazy load auth check** - Check auth hanya saat diperlukan

### User Experience

1. **Loading states** - Tampilkan loading saat auth check
2. **Error messages** - Berikan feedback yang jelas
3. **Auto redirect** - Redirect ke login jika unauthorized
4. **Remember me** - Session default 7 hari

---

## 📞 Support & Contact

Jika ada pertanyaan atau issue:
- Email: support@example.com
- Documentation: https://github.com/your-repo/docs

---

## 📝 Changelog

### v1.0.0 (2025-10-29)
- ✅ Email/Password Authentication
- ✅ Session Management
- ✅ JWT Token Support
- ✅ API Key Authentication
- ✅ Organization Support
- ✅ Admin Plugin

---

**Realmio URL:** https://0xauthx0.netlify.app

**Status:** ✅ Production Ready
