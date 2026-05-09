import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch {
      setError('Неверный логин или пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--surface)',
    }}>
      <div className="mesh-bg" style={{ position: 'fixed', inset: 0, zIndex: 0 }} />
      <div style={{
        position: 'relative', zIndex: 1,
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        padding: '40px 36px',
        width: 360,
        boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 36, height: 36,
            background: 'linear-gradient(135deg, var(--a1) 0%, #5b3fd4 100%)',
            borderRadius: 'var(--r)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="3" width="14" height="9" rx="2" fill="rgba(255,255,255,0.15)"/>
              <rect x="1" y="3" width="14" height="9" rx="2" stroke="rgba(255,255,255,0.7)" strokeWidth="1"/>
              <path d="M5 14h6M8 12v2" stroke="rgba(255,255,255,0.7)" strokeWidth="1" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--t1)' }}>DS Studio</div>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>Digital Signage</div>
          </div>
        </div>

        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', marginBottom: 6 }}>Вход</div>
        <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 24 }}>Введите учётные данные для доступа</div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 }}>
              Логин
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              autoFocus
              required
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 }}>
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{ width: '100%' }}
            />
          </div>

          {error && (
            <div style={{
              background: 'var(--red-soft)',
              border: '1px solid rgba(240,64,112,0.3)',
              borderRadius: 'var(--r)',
              padding: '10px 14px',
              color: 'var(--red)',
              fontSize: 13,
              marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: '11px' }}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
