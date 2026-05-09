import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import ContentPage from './pages/ContentPage';
import PlaylistsPage from './pages/PlaylistsPage';
import PlaylistEditor from './pages/PlaylistEditor';
import SceneEditor from './pages/SceneEditor';
import ScreensPage from './pages/ScreensPage';
import DevicesPage from './pages/DevicesPage';
import GroupsPage from './pages/GroupsPage';
import PlayerPage from './pages/PlayerPage';
import LoginPage from './pages/LoginPage';
import UsersPage from './pages/UsersPage';
import RolesPage from './pages/RolesPage';
import IntegrationsPage from './pages/IntegrationsPage';
import LogsPage from './pages/LogsPage';
import BackupPage from './pages/BackupPage';
import DashboardPage from './pages/DashboardPage';
import { AuthProvider, useAuth } from './AuthContext';
import PermissionToast from './components/PermissionToast';
import './App.css';

const NAV = [
  {
    to: '/dashboard', label: 'Дашборд', perm: 'dashboard.view',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>,
  },
  {
    to: '/content', label: 'Контент', perm: 'content.view',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><path d="M21 15l-5-5L5 21"/></svg>,
  },
  {
    to: '/playlists', label: 'Плейлисты', perm: 'playlists.view',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M3 12h18M3 18h12"/><circle cx="19" cy="18" r="2"/></svg>,
  },
  {
    to: '/screens', label: 'Экраны', perm: 'screens.view',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="3" width="20" height="14" rx="2.5"/><path d="M8 21h8M12 17v4"/></svg>,
  },
  {
    to: '/devices', label: 'Устройства', perm: 'devices.view',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="2" width="14" height="20" rx="3"/><circle cx="12" cy="17" r="1.2" fill="currentColor" stroke="none"/></svg>,
  },
  {
    to: '/groups', label: 'Группы', perm: 'groups.view',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8M12 3v4" strokeLinecap="round"/></svg>,
  },
];

const ADMIN_NAV = [
  {
    to: '/users', label: 'Пользователи', perm: 'users.view',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
  },
  {
    to: '/roles', label: 'Роли', perm: 'roles.view',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/></svg>,
  },
  {
    to: '/integrations', label: 'Интеграции', perm: 'integrations.view',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  },
  {
    to: '/logs', label: 'Логи', perm: 'logs.view',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  },
  {
    to: '/backup', label: 'Бекапы', perm: 'backup.view',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  },
];

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  return [theme, setTheme];
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t2)' }}>Загрузка...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function UserBadge() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 9,
          background: 'var(--glass)', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', padding: '8px 10px', cursor: 'pointer',
          transition: 'background 0.15s',
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--a1), #5b3fd4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
        }}>
          {user.username[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, textAlign: 'left', overflow: 'hidden' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.username}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.role_name}</div>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><path d="M6 9l6 6 6-6"/></svg>
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0,
            background: 'var(--surface3)', border: '1px solid var(--border)',
            borderRadius: 'var(--r)', overflow: 'hidden', zIndex: 100,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>
            <button
              onClick={handleLogout}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                background: 'none', border: 'none', color: 'var(--red)',
                padding: '10px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Выйти
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Layout({ children }) {
  const [theme, setTheme] = useTheme();
  const { hasPerm } = useAuth();
  const isLight = theme === 'light';

  const visibleNav = NAV.filter(n => hasPerm(n.perm));
  const visibleAdminNav = ADMIN_NAV.filter(n => hasPerm(n.perm));

  return (
    <div className="layout">
      <div className="mesh-bg" />

      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="3" width="14" height="9" rx="2" fill="rgba(255,255,255,0.15)"/>
              <rect x="1" y="3" width="14" height="9" rx="2" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/>
              <path d="M5 14h6M8 12v2" stroke="rgba(255,255,255,0.6)" strokeWidth="1" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className="sidebar-logo-name">DS Studio</div>
            <div className="sidebar-logo-sub">Digital Signage</div>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Навигация</div>
          {visibleNav.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              {({ isActive }) => (
                <>
                  {isActive && <span className="nav-item-dot" />}
                  <span className="nav-icon">{icon}</span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {visibleAdminNav.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-label">Администрирование</div>
            {visibleAdminNav.map(({ to, label, icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
                {({ isActive }) => (
                  <>
                    {isActive && <span className="nav-item-dot" />}
                    <span className="nav-icon">{icon}</span>
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        )}

        <div style={{ marginTop: 'auto' }}>
          <div className="theme-toggle">
            <span className="theme-toggle-label">
              {isLight ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ verticalAlign: 'middle', marginRight: 5 }}><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ verticalAlign: 'middle', marginRight: 5 }}><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>
              )}
              {isLight ? 'Светлая' : 'Тёмная'}
            </span>
            <button
              className={`theme-switch${isLight ? ' on' : ''}`}
              onClick={() => setTheme(isLight ? 'dark' : 'light')}
              aria-label="Переключить тему"
            >
              <span className="theme-switch-knob" />
            </button>
          </div>

          <div style={{ padding: '0 12px 12px' }}>
            <UserBadge />
          </div>
        </div>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PermissionToast />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/player/:screenId" element={<PlayerPage />} />
          <Route path="/*" element={
            <PrivateRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/content" element={<ContentPage />} />
                  <Route path="/playlists" element={<PlaylistsPage />} />
                  <Route path="/playlists/:id" element={<PlaylistEditor />} />
                  <Route path="/scenes/:id" element={<SceneEditor />} />
                  <Route path="/screens" element={<ScreensPage />} />
                  <Route path="/devices" element={<DevicesPage />} />
                  <Route path="/groups" element={<GroupsPage />} />
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/roles" element={<RolesPage />} />
                  <Route path="/integrations" element={<IntegrationsPage />} />
                  <Route path="/logs" element={<LogsPage />} />
                  <Route path="/backup" element={<BackupPage />} />
                </Routes>
              </Layout>
            </PrivateRoute>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
