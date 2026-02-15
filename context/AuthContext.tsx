import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { User } from '../types';

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

const TOKEN_KEY = 'qflow_token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }
    setToken(stored);
    fetch('/api/me', {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then(async res => {
        if (!res.ok) throw new Error('unauthorized');
        const data = await res.json();
        setUser(data.user);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error('login_failed');
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('qflow-auth-changed', { detail: { token: data.token } }));
    }
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      fetch('/api/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setToken(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('qflow-auth-changed', { detail: { token: null } }));
    }
  }, [token]);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('unauthorized');
      const data = await res.json();
      setUser(data.user);
    } catch (err) {
      console.error('Failed to refresh user', err);
      // Don't logout on refresh failure, just log the error
    }
  }, [token]);

  const value = useMemo(
    () => ({ user, token, loading, login, logout, refreshUser }),
    [user, token, loading, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
