// React Authentication Example
// Complete working example for React applications

import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AUTH_BASE_URL = 'https://0xauthx0.netlify.app/api/auth';

const authAPI = axios.create({
  baseURL: AUTH_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  }
});

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await authAPI.get('/get-session');
      if (response.data?.user) {
        setUser(response.data.user);
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email, password, name) => {
    try {
      setError(null);
      const response = await authAPI.post('/sign-up/email', {
        email,
        password,
        name
      });
      setUser(response.data.user);
      return response.data;
    } catch (err) {
      const message = err.response?.data?.message || 'Sign up failed';
      setError(message);
      throw new Error(message);
    }
  };

  const signIn = async (email, password) => {
    try {
      setError(null);
      const response = await authAPI.post('/sign-in/email', {
        email,
        password
      });
      setUser(response.data.user);
      return response.data;
    } catch (err) {
      const message = err.response?.data?.message || 'Sign in failed';
      setError(message);
      throw new Error(message);
    }
  };

  const signOut = async () => {
    try {
      await authAPI.post('/sign-out');
      setUser(null);
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  const updateProfile = async (data) => {
    try {
      const response = await authAPI.post('/user/update', data);
      setUser(response.data.user);
      return response.data;
    } catch (err) {
      throw new Error(err.response?.data?.message || 'Update failed');
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      error,
      signUp,
      signIn,
      signOut,
      updateProfile,
      isAuthenticated: !!user
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signIn, error, loading } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await signIn(email, password);
      window.location.href = '/dashboard';
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Login</h2>
      {error && <div className="error">{error}</div>}
      
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
      
      <button type="submit" disabled={loading}>
        {loading ? 'Loading...' : 'Login'}
      </button>
    </form>
  );
}

export function SignUpForm() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: ''
  });
  const { signUp, error, loading } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await signUp(formData.email, formData.password, formData.name);
      window.location.href = '/dashboard';
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Sign Up</h2>
      {error && <div className="error">{error}</div>}
      
      <input
        type="text"
        value={formData.name}
        onChange={(e) => setFormData({...formData, name: e.target.value})}
        placeholder="Full Name"
        required
      />
      
      <input
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({...formData, email: e.target.value})}
        placeholder="Email"
        required
      />
      
      <input
        type="password"
        value={formData.password}
        onChange={(e) => setFormData({...formData, password: e.target.value})}
        placeholder="Password"
        required
        minLength={8}
      />
      
      <button type="submit" disabled={loading}>
        {loading ? 'Creating account...' : 'Sign Up'}
      </button>
    </form>
  );
}

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    window.location.href = '/login';
    return null;
  }

  return children;
}

export function UserProfile() {
  const { user, signOut } = useAuth();

  if (!user) return null;

  return (
    <div className="user-profile">
      <h3>Welcome, {user.name}!</h3>
      <p>Email: {user.email}</p>
      <p>Account created: {new Date(user.createdAt).toLocaleDateString()}</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}
