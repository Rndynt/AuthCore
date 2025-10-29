// Node.js / Express Authentication Middleware
// Complete working example for Node.js backends

const axios = require('axios');

const AUTH_BASE_URL = 'https://0xauthx0.netlify.app/api/auth';

async function authenticateUser(req, res, next) {
  try {
    const sessionToken = req.cookies?.['__Secure-better-auth.session_token'];
    const bearerToken = req.headers.authorization?.replace('Bearer ', '');
    const apiKey = req.headers['x-api-key'];

    if (!sessionToken && !bearerToken && !apiKey) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Authentication required'
      });
    }

    const headers = {};
    
    if (sessionToken) {
      headers.Cookie = `__Secure-better-auth.session_token=${sessionToken}`;
    }
    
    if (bearerToken) {
      headers.Authorization = `Bearer ${bearerToken}`;
    }
    
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await axios.get(`${AUTH_BASE_URL}/get-session`, {
      headers,
      validateStatus: (status) => status < 500
    });

    if (response.status === 200 && response.data?.user) {
      req.user = response.data.user;
      req.session = response.data.session;
      next();
    } else {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid or expired session'
      });
    }
  } catch (error) {
    console.error('Authentication error:', error.message);
    res.status(500).json({
      error: 'internal_error',
      message: 'Authentication service error'
    });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Authentication required'
      });
    }

    if (req.user.role !== role && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Insufficient permissions'
      });
    }

    next();
  };
}

function optionalAuth(req, res, next) {
  authenticateUser(req, res, (err) => {
    if (err) {
      console.warn('Optional auth failed, continuing...');
    }
    next();
  });
}

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: 'https://your-frontend.com',
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());

app.get('/api/public', (req, res) => {
  res.json({ message: 'This is public data' });
});

app.get('/api/protected', authenticateUser, (req, res) => {
  res.json({
    message: 'This is protected data',
    user: req.user
  });
});

app.get('/api/admin', authenticateUser, requireRole('admin'), (req, res) => {
  res.json({
    message: 'This is admin data',
    user: req.user
  });
});

app.get('/api/optional', optionalAuth, (req, res) => {
  res.json({
    message: 'This works with or without auth',
    user: req.user || null
  });
});

app.post('/api/proxy/signup', async (req, res) => {
  try {
    const response = await axios.post(`${AUTH_BASE_URL}/sign-up/email`, req.body);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(
      error.response?.data || { error: 'signup_failed' }
    );
  }
});

app.post('/api/proxy/signin', async (req, res) => {
  try {
    const response = await axios.post(`${AUTH_BASE_URL}/sign-in/email`, req.body);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(
      error.response?.data || { error: 'signin_failed' }
    );
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = {
  authenticateUser,
  requireRole,
  optionalAuth
};
