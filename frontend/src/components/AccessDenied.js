import React from 'react';

export default function AccessDenied() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', minHeight: 360, gap: 16, padding: 40,
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>Нет доступа</div>
        <div style={{ fontSize: 13, color: 'var(--t3)', maxWidth: 320, lineHeight: 1.6 }}>
          У вас недостаточно прав для просмотра этого раздела.<br/>
          Обратитесь к администратору для получения доступа.
        </div>
      </div>
    </div>
  );
}
