import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { api, PermissionError } from '../api';
import { useAuth } from '../AuthContext';
import AccessDenied from '../components/AccessDenied';

const PERM_GROUPS = [
  {
    label: 'Контент', icon: '🖼',
    perms: [
      { key: 'content.view',       label: 'Просмотр' },
      { key: 'content.create',     label: 'Создание' },
      { key: 'content.edit_own',   label: 'Редактирование своего' },
      { key: 'content.edit_any',   label: 'Редактирование любого' },
      { key: 'content.delete_own', label: 'Удаление своего' },
      { key: 'content.delete_any', label: 'Удаление любого' },
    ],
  },
  {
    label: 'Плейлисты', icon: '▶',
    perms: [
      { key: 'playlists.view',       label: 'Просмотр' },
      { key: 'playlists.create',     label: 'Создание' },
      { key: 'playlists.edit_own',   label: 'Редактирование своего' },
      { key: 'playlists.edit_any',   label: 'Редактирование любого' },
      { key: 'playlists.delete_own', label: 'Удаление своего' },
      { key: 'playlists.delete_any', label: 'Удаление любого' },
      { key: 'playlists.versions',   label: 'Версии плейлистов' },
    ],
  },
  {
    label: 'Сцены', icon: '🎬',
    perms: [
      { key: 'scenes.view',       label: 'Просмотр' },
      { key: 'scenes.create',     label: 'Создание' },
      { key: 'scenes.edit_own',   label: 'Редактирование своего' },
      { key: 'scenes.edit_any',   label: 'Редактирование любого' },
      { key: 'scenes.delete_own', label: 'Удаление своего' },
      { key: 'scenes.delete_any', label: 'Удаление любого' },
      { key: 'scenes.versions',   label: 'Версии сцен' },
    ],
  },
  {
    label: 'Экраны', icon: '🖥',
    perms: [
      { key: 'screens.view',       label: 'Просмотр' },
      { key: 'screens.create',     label: 'Создание' },
      { key: 'screens.edit_own',   label: 'Редактирование своего' },
      { key: 'screens.edit_any',   label: 'Редактирование любого' },
      { key: 'screens.delete_own', label: 'Удаление своего' },
      { key: 'screens.delete_any', label: 'Удаление любого' },
    ],
  },
  {
    label: 'Группы устройств', icon: '📦',
    perms: [
      { key: 'groups.view',       label: 'Просмотр' },
      { key: 'groups.create',     label: 'Создание' },
      { key: 'groups.edit_own',   label: 'Редактирование своего' },
      { key: 'groups.edit_any',   label: 'Редактирование любого' },
      { key: 'groups.delete_own', label: 'Удаление своего' },
      { key: 'groups.delete_any', label: 'Удаление любого' },
    ],
  },
  {
    label: 'Устройства', icon: '📱',
    perms: [
      { key: 'devices.view',    label: 'Просмотр' },
      { key: 'devices.manage',  label: 'Управление (ВКЛ/ВЫКЛ TV, экран, расписание)' },
      { key: 'devices.approve', label: 'Подтверждение устройств' },
    ],
  },
  {
    label: 'Пользователи', icon: '👤',
    perms: [
      { key: 'users.view',   label: 'Просмотр' },
      { key: 'users.create', label: 'Создание' },
      { key: 'users.edit',   label: 'Редактирование' },
      { key: 'users.delete', label: 'Удаление' },
    ],
  },
  {
    label: 'Роли', icon: '🔑',
    perms: [
      { key: 'roles.view', label: 'Просмотр' },
      { key: 'roles.edit', label: 'Редактирование' },
    ],
  },
  {
    label: 'Интеграции', icon: '🔗',
    perms: [
      { key: 'integrations.view',   label: 'Просмотр вебхуков' },
      { key: 'integrations.manage', label: 'Создание, редактирование, удаление, тест' },
    ],
  },
  {
    label: 'Логи', icon: '📋',
    perms: [
      { key: 'logs.view',  label: 'Просмотр логов' },
      { key: 'logs.clear', label: 'Очистка логов' },
    ],
  },
  {
    label: 'Бекапы', icon: '💾',
    perms: [
      { key: 'backup.view',    label: 'Просмотр бекапов' },
      { key: 'backup.run',     label: 'Запуск бекапа' },
      { key: 'backup.manage',  label: 'Управление настройками' },
      { key: 'backup.restore', label: 'Восстановление из бекапа' },
    ],
  },
  {
    label: 'Дашборд', icon: '📊',
    perms: [
      { key: 'dashboard.view', label: 'Просмотр дашборда' },
    ],
  },
];

// Цвет по категории
const GROUP_COLORS = {
  'Контент': '#7c5cfc',
  'Плейлисты': '#e05c8a',
  'Сцены': '#10b981',
  'Экраны': '#6395ff',
  'Группы устройств': '#f59e0b',
  'Устройства': '#06b6d4',
  'Пользователи': '#ef4444',
  'Роли': '#8b5cf6',
  'Интеграции': '#f97316',
  'Логи': '#64748b',
  'Бекапы': '#0ea5e9',
  'Дашборд': '#6366f1',
};

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M20 6 9 17l-5-5"/></svg>
  );
}

// Компактное отображение привилегий на карточке роли
function PermBadges({ permissions }) {
  if (!permissions?.length) return <span style={{ fontSize: 12, color: 'var(--t3)', fontStyle: 'italic' }}>Нет привилегий</span>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {PERM_GROUPS.map(group => {
        const active = group.perms.filter(p => permissions.includes(p.key));
        if (!active.length) return null;
        const color = GROUP_COLORS[group.label] || 'var(--a1)';
        return (
          <div key={group.label} style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 110, flexShrink: 0 }}>{group.label}</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {active.map(p => (
                <span key={p.key} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 20,
                  background: `${color}18`, border: `1px solid ${color}40`,
                  color, fontWeight: 500,
                }}>{p.label}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Fullscreen модалка редактирования
function RoleModal({ role, onClose, onSave }) {
  const isEdit = !!role;
  const [name, setName] = useState(role?.name || '');
  const [perms, setPerms] = useState(new Set(role?.permissions || []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Закрытие по Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggle = (perm) => {
    setPerms(prev => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  };

  const toggleGroup = (groupPerms) => {
    const allOn = groupPerms.every(p => perms.has(p.key));
    setPerms(prev => {
      const next = new Set(prev);
      groupPerms.forEach(p => allOn ? next.delete(p.key) : next.add(p.key));
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Название обязательно'); return; }
    setSaving(true);
    try {
      const data = { name, permissions: [...perms] };
      if (isEdit) await api.updateRole(role.id, data);
      else await api.createRole(data);
      onSave();
    } catch (e) {
      try { setError(JSON.parse(e.message).error); } catch { setError(e.message); }
    } finally {
      setSaving(false);
    }
  };

  const totalSelected = perms.size;
  const totalAll = PERM_GROUPS.reduce((s, g) => s + g.perms.length, 0);

  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
    }}>
    <div style={{
      position: 'absolute', inset: 0,
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      animation: 'slideUp 0.18s ease',
    }}>
      {/* Шапка */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '0 24px', height: 60, flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Назад
        </button>
        <div style={{ width: 1, height: 22, background: 'var(--border2)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>
            {isEdit ? `Редактировать роль: ${role.name}` : 'Новая роль'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 1 }}>
            Выбрано {totalSelected} из {totalAll} привилегий
          </div>
        </div>
        {error && (
          <div style={{ fontSize: 12, color: 'var(--red)', background: 'rgba(239,68,68,0.1)', padding: '6px 12px', borderRadius: 8, maxWidth: 300 }}>
            {error}
          </div>
        )}
        <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
        </button>
      </div>

      {/* Тело */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px' }}>
        {/* Название */}
        <div style={{ maxWidth: 400, marginBottom: 32 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t1)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Название роли</label>
          <input
            className="form-input"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={isEdit && role?.is_system}
            placeholder="Например: Оператор"
            autoFocus={!isEdit}
            style={{ fontSize: 15, padding: '10px 14px' }}
          />
          {isEdit && role?.is_system && (
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6 }}>Системная роль — название нельзя изменить</div>
          )}
        </div>

        {/* Привилегии — сетка */}
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 20 }}>
          Привилегии
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {PERM_GROUPS.map(group => {
            const allOn = group.perms.every(p => perms.has(p.key));
            const someOn = group.perms.some(p => perms.has(p.key));
            const color = GROUP_COLORS[group.label] || 'var(--a1)';
            const activeCount = group.perms.filter(p => perms.has(p.key)).length;
            return (
              <div key={group.label} style={{
                background: 'var(--surface)',
                border: `1px solid ${someOn ? color + '40' : 'var(--border)'}`,
                borderRadius: 12, overflow: 'hidden',
                transition: 'border-color 0.15s',
              }}>
                {/* Заголовок группы */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 16px',
                  background: someOn ? `${color}10` : 'var(--surface2)',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                }} onClick={() => toggleGroup(group.perms)}>
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={el => { if (el) el.indeterminate = someOn && !allOn; }}
                    onChange={() => toggleGroup(group.perms)}
                    onClick={e => e.stopPropagation()}
                    style={{ width: 15, height: 15, cursor: 'pointer', accentColor: color, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, color: someOn ? color : 'var(--t1)', flex: 1 }}>
                    {group.label}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: someOn ? color : 'var(--t3)',
                    background: someOn ? `${color}18` : 'var(--surface)',
                    border: `1px solid ${someOn ? color + '40' : 'var(--border)'}`,
                    borderRadius: 10, padding: '1px 7px',
                  }}>
                    {activeCount}/{group.perms.length}
                  </span>
                </div>
                {/* Чекбоксы */}
                <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {group.perms.map(p => {
                    const on = perms.has(p.key);
                    return (
                      <label key={p.key} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        cursor: 'pointer', padding: '5px 8px', borderRadius: 8,
                        background: on ? `${color}0d` : 'transparent',
                        border: `1px solid ${on ? color + '30' : 'transparent'}`,
                        transition: 'background 0.1s, border-color 0.1s',
                      }}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(p.key)}
                          style={{ width: 14, height: 14, cursor: 'pointer', accentColor: color, flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 13, color: on ? 'var(--t1)' : 'var(--t2)', fontWeight: on ? 500 : 400, flex: 1 }}>
                          {p.label}
                        </span>
                        {on && <span style={{ color, flexShrink: 0 }}><CheckIcon /></span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
    </div>,
    document.body
  );
}

export default function RolesPage() {
  const { hasPerm } = useAuth();
  const [roles, setRoles] = useState([]);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.getRoles();
      setRoles(r);
    } catch (e) {
      if (e instanceof PermissionError) { setDenied(true); return; }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const del = async (role) => {
    if (!window.confirm(`Удалить роль «${role.name}»?`)) return;
    try {
      await api.deleteRole(role.id);
      setRoles(r => r.filter(x => x.id !== role.id));
    } catch (e) {
      if (!(e instanceof PermissionError)) {
        try { alert(JSON.parse(e.message).error); } catch { alert(e.message); }
      }
    }
  };

  if (loading) return <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--t3)' }}>Загрузка...</div>;
  if (denied) return <AccessDenied />;

  return (
    <div>
      <div className="page-header">
        <div className="page-title-row">
          <h1 className="page-title">Роли и привилегии</h1>
          <div className="page-sub">{roles.length} ролей</div>
        </div>
        {hasPerm('roles.edit') && (
          <button className="btn btn-primary" onClick={() => setModal('create')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Новая роль
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {roles.map(role => (
          <div key={role.id} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: 0 }}>
            {/* Заголовок роли */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: 'linear-gradient(135deg, var(--a1), #5b3fd4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: '#fff',
              }}>
                {role.name[0].toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--t1)' }}>{role.name}</span>
                  {role.is_system === 1 && (
                    <span style={{ fontSize: 10, background: 'var(--accent-soft)', color: 'var(--a1)', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>системная</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                  {role.permissions?.length || 0} привилегий
                </div>
              </div>
              {hasPerm('roles.edit') && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setModal(role)}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Изменить
                  </button>
                  {!role.is_system && (
                    <button className="btn btn-danger btn-sm" onClick={() => del(role)}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Привилегии по группам */}
            <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px 14px' }}>
              <PermBadges permissions={role.permissions} />
            </div>
          </div>
        ))}
      </div>

      {(modal === 'create' || (modal && typeof modal === 'object')) && (
        <RoleModal
          role={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
