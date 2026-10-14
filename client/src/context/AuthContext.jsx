import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('smartshop_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('smartshop_token'));
  const [loading, setLoading] = useState(true);

  // Normalize user object format
  const normalizeUser = (rawUser) => {
    if (!rawUser) return null;
    const role = (rawUser.role || 'SHOPKEEPER').toUpperCase();
    return {
      id: rawUser.id,
      email: rawUser.email,
      role: role,
      shopId: rawUser.shopId || rawUser.shop_id || null,
      fullName: rawUser.fullName || rawUser.full_name || rawUser.name || 'Shop User',
      shopName: rawUser.shopName || rawUser.shop_name || rawUser.shop?.name || 'Smart Shop',
      language: rawUser.language || 'en',
      theme: rawUser.theme || 'dark',
    };
  };

  const logout = useCallback(() => {
    localStorage.removeItem('smartshop_token');
    localStorage.removeItem('smartshop_user');
    setToken(null);
    setUser(null);
  }, []);

  // Listen for 401 unauthorized event from api.js
  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [logout]);

  // Load user profile on mount if token exists
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const storedToken = localStorage.getItem('smartshop_token');
      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get('/auth/me');
        const userData = response.user || response.data || response;
        const normalized = normalizeUser(userData);
        setUser(normalized);
        localStorage.setItem('smartshop_user', JSON.stringify(normalized));
      } catch (err) {
        console.error('Failed to restore user session:', err);
        // If stored user exists, keep it as fallback unless 401
        const storedUser = localStorage.getItem('smartshop_user');
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch {
            logout();
          }
        }
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentUser();
  }, [logout]);

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const authToken = response.token || response.accessToken;
    const rawUser = response.user || response.data?.user || response.data;

    if (!authToken) {
      throw new Error('No authentication token received from server.');
    }

    const normalized = normalizeUser(rawUser);

    localStorage.setItem('smartshop_token', authToken);
    localStorage.setItem('smartshop_user', JSON.stringify(normalized));
    setToken(authToken);
    setUser(normalized);
    return normalized;
  };

  const updateUser = (data) => {
    setUser((prev) => {
      const updated = { ...prev, ...data };
      localStorage.setItem('smartshop_user', JSON.stringify(updated));
      return updated;
    });
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token && !!user,
    isAdmin: user?.role === 'ADMIN',
    isOwner: user?.role === 'SHOPKEEPER' || user?.role === 'ADMIN',
    login,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
