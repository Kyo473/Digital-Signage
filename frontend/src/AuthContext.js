import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ds_token');
    console.log('[Auth] init, token:', token ? token.slice(0, 20) + '...' : 'NULL');
    if (!token) { setLoading(false); return; }
    api.getMe()
      .then(u => { console.log('[Auth] getMe ok:', u.username); setUser(u); })
      .catch(err => {
        console.error('[Auth] getMe error:', err.message, err);
        if (err.message === 'Unauthorized') {
          console.warn('[Auth] removing token due to Unauthorized');
          localStorage.removeItem('ds_token');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // Глобальный обработчик 401 — сбрасывает сессию без жёсткого редиректа
  useEffect(() => {
    const handler = () => setUser(null);
    window.addEventListener('ds:unauthorized', handler);
    return () => window.removeEventListener('ds:unauthorized', handler);
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.login({ username, password });
    localStorage.setItem('ds_token', data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('ds_token');
    setUser(null);
  }, []);

  const hasPerm = useCallback((perm) => {
    if (!user) return false;
    return (user.permissions || []).includes(perm);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPerm }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
