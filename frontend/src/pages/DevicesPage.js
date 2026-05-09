import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, PermissionError } from '../api';
import { useAuth } from '../AuthContext';
import AccessDenied from '../components/AccessDenied';

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function timeAgo(ts) {
  if (!ts) return '—';
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return `${d}с назад`;
  if (d < 3600) return `${Math.floor(d / 60)}м назад`;
  if (d < 86400) return `${Math.floor(d / 3600)}ч назад`;
  return `${Math.floor(d / 86400)}д назад`;
}
const isOnline = ts => ts && (Math.floor(Date.now() / 1000) - ts) < 30;

function DaysBadges({ days }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {DAY_LABELS.map((label, i) => (
        <span key={i} style={{
          fontSize: 10, fontWeight: 600, padding: '2px 5px', borderRadius: 4,
          background: days[i] === '1' ? 'var(--accent)' : 'var(--surface2)',
          color: days[i] === '1' ? '#fff' : 'var(--t3)',
          opacity: days[i] === '1' ? 1 : 0.45,
        }}>{label}</span>
      ))}
    </span>
  );
}

// ── Встроенный редактор расписания ────────────────────────────────────────────

function ScheduleInline({ deviceId, schedule, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState(schedule?.days ?? '1111100');
  const [onTime, setOnTime] = useState(schedule?.on_time ?? '08:00');
  const [offTime, setOffTime] = useState(schedule?.off_time ?? '22:00');
  const [saving, setSaving] = useState(false);

  // Синхронизируем если schedule пришёл снаружи
  useEffect(() => {
    if (!editing) {
      setDays(schedule?.days ?? '1111100');
      setOnTime(schedule?.on_time ?? '08:00');
      setOffTime(schedule?.off_time ?? '22:00');
    }
  }, [schedule, editing]);

  function toggleDay(i) {
    setDays(d => d.slice(0, i) + (d[i] === '1' ? '0' : '1') + d.slice(i + 1));
  }

  async function save() {
    setSaving(true);
    try {
      if (schedule) {
        await api.updateSchedule(schedule.id, { days, on_time: onTime, off_time: offTime });
      } else {
        await api.createSchedule({ device_id: deviceId, days, on_time: onTime, off_time: offTime, enabled: true });
      }
      setEditing(false);
      onChanged();
    } catch (e) {
      if (!(e instanceof PermissionError)) console.error(e);
    } finally { setSaving(false); }
  }

  async function toggleEnabled() {
    if (!schedule) return;
    try { await api.updateSchedule(schedule.id, { enabled: !schedule.enabled }); onChanged(); }
    catch (e) { if (!(e instanceof PermissionError)) console.error(e); }
  }

  async function del() {
    if (!schedule) return;
    try { await api.deleteSchedule(schedule.id); onChanged(); }
    catch (e) { if (!(e instanceof PermissionError)) console.error(e); }
  }

  if (!schedule && !editing) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} style={{ fontSize: 11 }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Расписание
      </button>
    );
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8, marginTop: 6 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {DAY_LABELS.map((label, i) => (
            <button key={i} type="button" onClick={() => toggleDay(i)} style={{
              width: 26, height: 22, borderRadius: 4, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 10,
              background: days[i] === '1' ? 'var(--accent)' : 'var(--border2)',
              color: days[i] === '1' ? '#fff' : 'var(--t3)',
            }}>{label}</button>
          ))}
        </div>
        <input type="time" value={onTime} onChange={e => setOnTime(e.target.value)}
          style={{ fontSize: 12, padding: '3px 6px', width: 90 }} />
        <span style={{ fontSize: 11, color: 'var(--t3)' }}>—</span>
        <input type="time" value={offTime} onChange={e => setOffTime(e.target.value)}
          style={{ fontSize: 12, padding: '3px 6px', width: 90 }} />
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving} style={{ fontSize: 11 }}>
          {saving ? '...' : 'Сохранить'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} style={{ fontSize: 11 }}>Отмена</button>
      </div>
    );
  }

  // Показываем текущее расписание
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <DaysBadges days={schedule.days} />
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>
        {schedule.on_time} — {schedule.off_time}
      </span>
      <button type="button"
        className={`theme-switch${schedule.enabled ? ' on' : ''}`}
        onClick={toggleEnabled}
        title={schedule.enabled ? 'Отключить расписание' : 'Включить расписание'}
        style={{ transform: 'scale(0.8)', flexShrink: 0 }}>
        <span className="theme-switch-knob" />
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} style={{ padding: '2px 6px' }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button className="btn btn-danger btn-sm" onClick={del} style={{ padding: '2px 6px' }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    </div>
  );
}

// ── Карточка устройства ───────────────────────────────────────────────────────

function DeviceRow({ d, screens, groups, schedules, onRefresh, onRevoke }) {
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  const online = isOnline(d.last_seen);
  const inGroup = !!d.group_id;
  const group = inGroup ? groups.find(g => g.id === d.group_id) : null;
  const schedule = schedules.find(s => s.device_id === d.id) ?? null;

  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(d.name || '');
  const [tvSending, setTvSending] = useState(null);
  const [lastTvCmd, setLastTvCmd] = useState(null);

  const screenName = sid => screens.find(s => s.id === sid)?.name;

  function goToGroup() {
    navigate('/groups');
  }

  async function saveRename(e) {
    e.preventDefault();
    try {
      if (editName.trim()) await api.updateDevice(d.id, { name: editName.trim() });
      setEditingName(false);
      onRefresh();
    } catch (err) { if (!(err instanceof PermissionError)) console.error(err); }
  }

  async function assignScreen(screenId) {
    try { await api.updateDevice(d.id, { screen_id: screenId || null }); onRefresh(); }
    catch (err) { if (!(err instanceof PermissionError)) console.error(err); }
  }

  async function del() {
    if (!window.confirm('Удалить устройство?')) return;
    try { await api.deleteDevice(d.id); onRefresh(); }
    catch (err) { if (!(err instanceof PermissionError)) console.error(err); }
  }

  async function sendTv(cmd) {
    if (!online) return;
    setTvSending(cmd);
    try {
      await api.sendTvCommand(d.id, cmd);
      setLastTvCmd(cmd);
    } catch { /* PermissionToast или другие ошибки уже обработаны */ }
    finally { setTvSending(null); }
  }

  // Оверлей блокировки для устройств в группе
  const GroupLock = ({ children }) => (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <div style={{ opacity: 0.35, pointerEvents: 'none' }}>{children}</div>
      <div
        onClick={goToGroup}
        title={`Устройство в группе «${group?.name}» — нажмите для перехода`}
        style={{ position: 'absolute', inset: 0, cursor: 'pointer', zIndex: 1 }}
      />
    </div>
  );

  return (
    <div className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: 0, opacity: inGroup ? 0.85 : 1 }}>
      {/* Плашка группы */}
      {inGroup && (
        <div
          onClick={goToGroup}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', background: 'var(--accent)', borderRadius: '10px 10px 0 0',
            fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8M12 3v4" strokeLinecap="round"/></svg>
          Группа: {group?.name ?? '…'}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 'auto' }}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', flexWrap: 'wrap' }}>
        {/* Иконка */}
        <div style={{ position: 'relative', flexShrink: 0, marginTop: 2 }}>
          <div className={`icon-box ${online ? 'ib-green' : 'ib-muted'}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke={online ? 'var(--green)' : 'var(--t3)'} strokeWidth="2">
              <rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="17" r="1"/>
            </svg>
          </div>
          <span className={online ? 'dot-online' : 'dot-offline'}
            style={{ position: 'absolute', bottom: -3, right: -3, border: '2px solid var(--surface)' }}/>
        </div>

        {/* Основная информация */}
        <div style={{ flex: 1, minWidth: 160 }}>
          {/* Имя */}
          {editingName && !inGroup ? (
            <form onSubmit={saveRename} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                style={{ fontSize: 13, padding: '4px 8px', width: 180 }}/>
              <button type="submit" className="btn btn-primary btn-sm">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M20 6 9 17l-5-5"/></svg>
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingName(false)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </form>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--t1)' }}>
                {d.name || <span style={{ color: 'var(--t3)', fontWeight: 400, fontStyle: 'italic' }}>Без имени</span>}
              </span>
              <span className="code-badge">{d.code}</span>
              {!inGroup && hasPerm('devices.manage') && (
                <button className="btn btn-ghost btn-sm"
                  onClick={() => { setEditName(d.name || ''); setEditingName(true); }}
                  style={{ padding: '2px 6px', fontSize: 11 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              )}
            </div>
          )}

          {/* Статус + экран */}
          <div style={{ fontSize: 11, color: 'var(--t3)', display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ color: online ? 'var(--green)' : 'var(--t3)', fontWeight: online ? 600 : 400 }}>
              {online ? '● Онлайн' : `○ ${timeAgo(d.last_seen)}`}
            </span>
            <span>{d.screen_id ? `Экран: ${screenName(d.screen_id) ?? d.screen_id}` : 'Экран не назначен'}</span>
          </div>

          {/* Расписание — только для устройств без группы */}
          {!inGroup && hasPerm('devices.manage') ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>Расписание</span>
              <ScheduleInline deviceId={d.id} schedule={schedule} onChanged={onRefresh} />
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>
              Расписание управляется группой
              {group?.schedule && (
                <span style={{ marginLeft: 6, fontStyle: 'normal' }}>
                  <DaysBadges days={group.schedule.days} />
                  <span style={{ marginLeft: 4, fontWeight: 600, color: 'var(--t2)' }}>
                    {group.schedule.on_time} — {group.schedule.off_time}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Правая панель — TV + Экран + Удалить */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
          {/* TV кнопки */}
          {hasPerm('devices.manage') && (inGroup ? (
            <GroupLock>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-sm" disabled style={{ fontSize: 11 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
                  Вкл TV
                </button>
                <button className="btn btn-sm" disabled style={{ fontSize: 11 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
                  Выкл TV
                </button>
              </div>
            </GroupLock>
          ) : (
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-sm"
                title={online ? 'Включить телевизор' : 'Устройство офлайн'}
                disabled={!online || tvSending !== null}
                onClick={() => sendTv('on')}
                style={{
                  fontSize: 11, opacity: !online ? 0.4 : 1,
                  background: lastTvCmd === 'on' ? 'rgba(16,185,129,0.15)' : undefined,
                  borderColor: lastTvCmd === 'on' ? '#10b981' : undefined,
                  color: lastTvCmd === 'on' ? '#10b981' : undefined,
                }}>
                {tvSending === 'on' ? '...' : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg> Вкл TV</>}
              </button>
              <button className="btn btn-sm"
                title={online ? 'Выключить телевизор' : 'Устройство офлайн'}
                disabled={!online || tvSending !== null}
                onClick={() => sendTv('off')}
                style={{
                  fontSize: 11, opacity: !online ? 0.4 : 1,
                  background: lastTvCmd === 'off' ? 'rgba(239,68,68,0.12)' : undefined,
                  borderColor: lastTvCmd === 'off' ? '#ef4444' : undefined,
                  color: lastTvCmd === 'off' ? '#ef4444' : undefined,
                }}>
                {tvSending === 'off' ? '...' : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg> Выкл TV</>}
              </button>
            </div>
          ))}

          {hasPerm('devices.manage') && <div style={{ width: 1, height: 20, background: 'var(--border2)', flexShrink: 0 }} />}

          {/* Выбор экрана */}
          {hasPerm('devices.manage') && (inGroup ? (
            <GroupLock>
              <select disabled style={{ fontSize: 12, padding: '6px 10px', width: 160 }} value={d.screen_id ?? ''} onChange={() => {}}>
                <option value="">— не назначен —</option>
                {screens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </GroupLock>
          ) : (
            <select
              value={d.screen_id ?? ''}
              onChange={e => assignScreen(e.target.value)}
              style={{ fontSize: 12, padding: '6px 10px', width: 160 }}
            >
              <option value="">— не назначен —</option>
              {screens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ))}

          {onRevoke && d.approved && (
            <button
              className="btn btn-ghost btn-sm"
              title="Отозвать подтверждение"
              onClick={() => onRevoke(d.id)}
              style={{ color: 'var(--t3)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18.36 6.64A9 9 0 1 1 5.64 19.36"/><path d="M23 4L4 23"/>
              </svg>
            </button>
          )}
          {hasPerm('devices.manage') && (
            <button className="btn btn-danger btn-sm" onClick={del}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Страница ──────────────────────────────────────────────────────────────────

export default function DevicesPage() {
  const { hasPerm } = useAuth();
  const [devices, setDevices] = useState([]);
  const [screens, setScreens] = useState([]);
  const [groups, setGroups] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [, setTick] = useState(0);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, s, g, sc] = await Promise.all([
        api.getDevices(), api.getScreens(), api.getGroups(), api.getSchedules(),
      ]);
      setDevices(d); setScreens(s); setGroups(g); setSchedules(sc);
    } catch (e) {
      if (e instanceof PermissionError) setDenied(true);
    }
  }, []);

  const handleApprove = async (id) => {
    try {
      await api.approveDevice(id);
      await load();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleRevoke = async (id) => {
    if (!window.confirm('Отозвать подтверждение устройства?')) return;
    try {
      await api.revokeDevice(id);
      await load();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteDevice(id);
      await load();
    } catch (e) {
      alert(e.message);
    }
  };

  useEffect(() => {
    load();
    const a = setInterval(load, 10000);
    const b = setInterval(() => setTick(n => n + 1), 5000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [load]);

  const pending = devices.filter(d => !d.approved);
  const approved = devices.filter(d => d.approved);
  const onlineCount = approved.filter(d => isOnline(d.last_seen)).length;

  if (denied) return <AccessDenied />;

  return (
    <div>
      <div className="page-header">
        <div className="page-title-row">
          <h1 className="page-title">Устройства</h1>
          <div className="page-sub">
            {approved.length} зарегистрировано
            {onlineCount > 0 && (
              <span style={{ marginLeft: 8, color: 'var(--green)', fontWeight: 600 }}>· {onlineCount} онлайн</span>
            )}
            {pending.length > 0 && (
              <span style={{ marginLeft: 8, color: '#f59e0b', fontWeight: 600 }}>· {pending.length} ожидают подтверждения</span>
            )}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Обновить
        </button>
      </div>

      {/* Секция «Ожидают подтверждения» */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: 'var(--t2)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            marginBottom: 10, paddingLeft: 4,
          }}>
            Ожидают подтверждения ({pending.length})
          </div>
          {pending.map(device => (
            <div key={device.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', borderRadius: 'var(--r)',
              background: 'var(--surface2)',
              border: '1px solid rgba(251,191,36,0.3)',
              marginBottom: 6,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: '#f59e0b', boxShadow: '0 0 6px #f59e0b',
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                  {device.name || device.code}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                  Код: {device.code} · Ожидает подтверждения
                </div>
              </div>
              {hasPerm('devices.approve') && (
                <button
                  className="btn btn-sm"
                  style={{ background: '#10b981', color: '#fff', border: 'none' }}
                  onClick={() => handleApprove(device.id)}
                >
                  Подтвердить
                </button>
              )}
              {hasPerm('devices.approve') && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--red)' }}
                  onClick={() => handleDelete(device.id)}
                >
                  Отклонить
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Заголовок подтверждённых (только если есть обе секции) */}
      {pending.length > 0 && approved.length > 0 && (
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--t2)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
          marginBottom: 10, paddingLeft: 4,
        }}>
          Подтверждённые ({approved.length})
        </div>
      )}

      {approved.length === 0 && pending.length === 0 ? (
        <div className="empty-state">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="17" r="1"/>
          </svg>
          <strong>Нет устройств</strong>
          <p>Запустите DS Player на телевизоре и введите код из этого раздела</p>
        </div>
      ) : approved.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {approved.map(d => (
            <DeviceRow
              key={d.id}
              d={d}
              screens={screens}
              groups={groups}
              schedules={schedules}
              onRefresh={load}
              onRevoke={hasPerm('devices.approve') ? handleRevoke : null}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
