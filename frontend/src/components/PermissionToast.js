import React, { useEffect, useState } from 'react';

export default function PermissionToast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    function handler(e) {
      const id = Date.now() + Math.random();
      const message = e.detail?.message || 'Недостаточно прав';
      setToasts(prev => [...prev, { id, message }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
    }
    window.addEventListener('ds:permission-denied', handler);
    return () => window.removeEventListener('ds:permission-denied', handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: 'var(--surface)', border: '1px solid rgba(239,68,68,0.4)',
          borderLeft: '3px solid #ef4444',
          borderRadius: 10, padding: '12px 16px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
          maxWidth: 360, pointerEvents: 'all',
          animation: 'toast-in 0.2s ease',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>Нет доступа</div>
            <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.4 }}>{t.message}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
