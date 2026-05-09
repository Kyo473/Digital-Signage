import React, { useEffect, useState, useCallback } from 'react';
import { api, PermissionError } from '../api';
import { useAuth } from '../AuthContext';
import AccessDenied from '../components/AccessDenied';

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const isOnline = ts => ts && (Math.floor(Date.now() / 1000) - ts) < 30;

function timeAgo(ts) {
  if (!ts) return '—';
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return `${d}с`;
  if (d < 3600) return `${Math.floor(d / 60)}м`;
  if (d < 86400) return `${Math.floor(d / 3600)}ч`;
  return `${Math.floor(d / 86400)}д`;
}

function X() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

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

// ── Модалка создания/редактирования группы ────────────────────────────────────

function GroupModal({ group, screens, allDevices, groupDeviceIds, onClose, onSaved }) {
  const isEdit = !!group;
  const [name, setName] = useState(group?.name ?? '');
  const [screenId, setScreenId] = useState(group?.screen_id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Введите название'); return; }
    setLoading(true); setError('');
    try {
      if (isEdit) {
        await api.updateGroup(group.id, { name: name.trim(), screen_id: screenId || null });
      } else {
        await api.createGroup({ name: name.trim() });
      }
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => { e._t = e.target; }} onMouseUp={e => { if (e._t === e.currentTarget && e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 440 }}>
        <div className="modal-header">
          <h2>{isEdit ? 'Редактировать группу' : 'Новая группа'}</h2>
          <button className="modal-close" onClick={onClose}><X /></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12, background: 'rgba(224,82,82,0.1)', padding: '8px 12px', borderRadius: 8 }}>{error}</div>}
            <div className="form-group">
              <label>Название группы</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Например: Зал 1" autoFocus required />
            </div>
            {isEdit && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Экран для всех устройств группы</label>
                <select value={screenId} onChange={e => setScreenId(e.target.value)}>
                  <option value="">— не назначен —</option>
                  {screens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>Изменит экран у всех устройств в группе</div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Модалка расписания группы ─────────────────────────────────────────────────

function ScheduleModal({ groupId, existing, onClose, onSaved }) {
  const [days, setDays] = useState(existing?.days ?? '1111100');
  const [onTime, setOnTime] = useState(existing?.on_time ?? '08:00');
  const [offTime, setOffTime] = useState(existing?.off_time ?? '22:00');
  const [enabled, setEnabled] = useState(existing ? existing.enabled === 1 || existing.enabled === true : true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function toggleDay(i) {
    setDays(d => d.slice(0, i) + (d[i] === '1' ? '0' : '1') + d.slice(i + 1));
  }

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      if (existing) {
        await api.updateSchedule(existing.id, { days, on_time: onTime, off_time: offTime, enabled });
      } else {
        await api.createSchedule({ group_id: groupId, days, on_time: onTime, off_time: offTime, enabled });
      }
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => { e._t = e.target; }} onMouseUp={e => { if (e._t === e.currentTarget && e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 460 }}>
        <div className="modal-header">
          <h2>{existing ? 'Изменить расписание' : 'Добавить расписание'}</h2>
          <button className="modal-close" onClick={onClose}><X /></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12, background: 'rgba(224,82,82,0.1)', padding: '8px 12px', borderRadius: 8 }}>{error}</div>}
            <div className="form-group">
              <label>Дни недели</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {DAY_LABELS.map((label, i) => (
                  <button key={i} type="button" onClick={() => toggleDay(i)} style={{
                    padding: '5px 11px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontWeight: 600, fontSize: 12,
                    background: days[i] === '1' ? 'var(--accent)' : 'var(--surface2)',
                    color: days[i] === '1' ? '#fff' : 'var(--t2)',
                    transition: 'background 0.15s',
                  }}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Включить в</label>
                <input type="time" value={onTime} onChange={e => setOnTime(e.target.value)} required />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Выключить в</label>
                <input type="time" value={offTime} onChange={e => setOffTime(e.target.value)} required />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 12, marginBottom: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <span>Активно</span>
                <button type="button" className={`theme-switch${enabled ? ' on' : ''}`} onClick={() => setEnabled(v => !v)}>
                  <span className="theme-switch-knob" />
                </button>
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Сохранение...' : 'Сохранить'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Модалка добавления устройства в группу ────────────────────────────────────

function AddDeviceModal({ groupId, freeDevices, onClose, onSaved }) {
  const [deviceId, setDeviceId] = useState(freeDevices[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!deviceId) { setError('Выберите устройство'); return; }
    setLoading(true); setError('');
    try {
      await api.addGroupMember(groupId, deviceId);
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => { e._t = e.target; }} onMouseUp={e => { if (e._t === e.currentTarget && e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 380 }}>
        <div className="modal-header">
          <h2>Добавить устройство</h2>
          <button className="modal-close" onClick={onClose}><X /></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12, background: 'rgba(224,82,82,0.1)', padding: '8px 12px', borderRadius: 8 }}>{error}</div>}
            {freeDevices.length === 0 ? (
              <p style={{ color: 'var(--t2)', fontSize: 13 }}>Все устройства уже находятся в группах.</p>
            ) : (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Устройство</label>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}>
                  {freeDevices.map(d => <option key={d.id} value={d.id}>{d.name || d.code} ({d.code})</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
            {freeDevices.length > 0 && (
              <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Добавление...' : 'Добавить'}</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Карточка группы ───────────────────────────────────────────────────────────

function GroupCard({ group, screens, allDevices, onRefresh }) {
  const { hasPerm } = useAuth();
  const [tvSending, setTvSending] = useState(null);
  const [lastTvCmd, setLastTvCmd] = useState(null);
  const [modal, setModal] = useState(null); // 'edit' | 'schedule' | 'addDevice'
  const [editingScreen, setEditingScreen] = useState(false);
  const [screenId, setScreenId] = useState(group.screen_id ?? '');

  const screenName = id => screens.find(s => s.id === id)?.name;
  const onlineCount = group.members.filter(d => isOnline(d.last_seen)).length;
  const freeDevices = allDevices.filter(d => !d.group_id || d.group_id === group.id ? false : true)
    .concat(allDevices.filter(d => !d.group_id));

  async function sendTvCmd(cmd) {
    setTvSending(cmd);
    try {
      await api.sendGroupTvCommand(group.id, cmd);
      setLastTvCmd(cmd);
    } catch { /* PermissionToast или другие ошибки уже обработаны */ }
    finally { setTvSending(null); }
  }

  async function removeDevice(deviceId) {
    try { await api.removeGroupMember(group.id, deviceId); onRefresh(); }
    catch (e) { if (!(e instanceof PermissionError)) console.error(e); }
  }

  async function deleteGroup() {
    if (!window.confirm(`Удалить группу «${group.name}»? Устройства останутся.`)) return;
    try { await api.deleteGroup(group.id); onRefresh(); }
    catch (e) { if (!(e instanceof PermissionError)) console.error(e); }
  }

  async function deleteSchedule() {
    if (!window.confirm('Удалить расписание?')) return;
    try { await api.deleteSchedule(group.schedule.id); onRefresh(); }
    catch (e) { if (!(e instanceof PermissionError)) console.error(e); }
  }

  async function saveScreen(sid) {
    try { await api.updateGroup(group.id, { screen_id: sid || null }); setEditingScreen(false); onRefresh(); }
    catch (e) { if (!(e instanceof PermissionError)) console.error(e); }
  }

  async function toggleSchedule() {
    if (!group.schedule) return;
    try { await api.updateSchedule(group.schedule.id, { enabled: !group.schedule.enabled }); onRefresh(); }
    catch (e) { if (!(e instanceof PermissionError)) console.error(e); }
  }

  return (
    <>
      <div className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: 0 }}>
        {/* Шапка группы */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
          <div className={`icon-box ${onlineCount > 0 ? 'ib-green' : 'ib-muted'}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={onlineCount > 0 ? 'var(--green)' : 'var(--t3)'} strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 3H8M12 3v4" strokeLinecap="round" />
            </svg>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--t1)' }}>{group.name}</span>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>{group.members.length} устр.</span>
              {onlineCount > 0 && <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>· {onlineCount} онлайн</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
              {group.screen_id ? `Экран: ${screenName(group.screen_id) ?? group.screen_id}` : 'Экран не назначен'}
            </div>
          </div>

          {/* TV кнопки для группы */}
          {hasPerm('devices.manage') && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button className="btn btn-sm" title="Включить TV всей группы"
                disabled={tvSending !== null}
                onClick={() => sendTvCmd('on')}
                style={{ fontSize: 11, background: lastTvCmd === 'on' ? 'rgba(16,185,129,0.15)' : undefined, borderColor: lastTvCmd === 'on' ? '#10b981' : undefined, color: lastTvCmd === 'on' ? '#10b981' : undefined }}>
                {tvSending === 'on' ? '...' : (
                  <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-6" /></svg> Вкл TV</>
                )}
              </button>
              <button className="btn btn-sm" title="Выключить TV всей группы"
                disabled={tvSending !== null}
                onClick={() => sendTvCmd('off')}
                style={{ fontSize: 11, background: lastTvCmd === 'off' ? 'rgba(239,68,68,0.12)' : undefined, borderColor: lastTvCmd === 'off' ? '#ef4444' : undefined, color: lastTvCmd === 'off' ? '#ef4444' : undefined }}>
                {tvSending === 'off' ? '...' : (
                  <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></svg> Выкл TV</>
                )}
              </button>
            </div>
          )}

          <div style={{ width: 1, height: 20, background: 'var(--border2)', flexShrink: 0 }} />

          {(hasPerm('groups.edit_any') || hasPerm('groups.edit_own')) && (
            <button className="btn btn-ghost btn-sm" onClick={() => setModal('edit')}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              Изменить
            </button>
          )}
          {(hasPerm('groups.delete_any') || hasPerm('groups.delete_own')) && (
            <button className="btn btn-danger btn-sm" onClick={deleteGroup}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
            </button>
          )}
        </div>

        {/* Экран + расписание */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Экран */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Экран</span>
            {(hasPerm('groups.edit_any') || hasPerm('groups.edit_own')) ? (
              editingScreen ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <select value={screenId} onChange={e => setScreenId(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', width: 160 }}>
                    <option value="">— не назначен —</option>
                    {screens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={() => saveScreen(screenId)}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M20 6 9 17l-5-5" /></svg>
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingScreen(false)}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => { setScreenId(group.screen_id ?? ''); setEditingScreen(true); }} style={{ fontSize: 12 }}>
                  {group.screen_id ? screenName(group.screen_id) : '— не назначен —'}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 4 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </button>
              )
            ) : (
              <span style={{ fontSize: 12, color: 'var(--t2)' }}>{group.screen_id ? screenName(group.screen_id) : '— не назначен —'}</span>
            )}
          </div>

          <div style={{ width: 1, height: 16, background: 'var(--border2)' }} />

          {/* Расписание */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Расписание</span>
            {group.schedule ? (
              <>
                <DaysBadges days={group.schedule.days} />
                <span style={{ fontSize: 12, color: 'var(--t2)', fontWeight: 600 }}>{group.schedule.on_time} — {group.schedule.off_time}</span>
                {hasPerm('devices.manage') && (
                  <>
                    <button type="button" className={`theme-switch${group.schedule.enabled ? ' on' : ''}`} onClick={toggleSchedule} style={{ transform: 'scale(0.85)' }}>
                      <span className="theme-switch-knob" />
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setModal('schedule')}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={deleteSchedule}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                    </button>
                  </>
                )}
              </>
            ) : hasPerm('devices.manage') ? (
              <button className="btn btn-ghost btn-sm" onClick={() => setModal('schedule')} style={{ fontSize: 12 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                Добавить
              </button>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--t3)', fontStyle: 'italic' }}>Не настроено</span>
            )}
          </div>
        </div>

        {/* Список устройств */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '8px 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Устройства</span>
            {(hasPerm('groups.edit_any') || hasPerm('groups.edit_own')) && (
              <button className="btn btn-ghost btn-sm" onClick={() => setModal('addDevice')} style={{ fontSize: 11 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                Добавить
              </button>
            )}
          </div>
          {group.members.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t3)', fontStyle: 'italic' }}>Нет устройств</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {group.members.map(d => {
                const online = isOnline(d.last_seen);
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px', borderRadius: 8, background: 'var(--surface2)' }}>
                    <span className={online ? 'dot-online' : 'dot-offline'} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                      {d.name || <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>Без имени</span>}
                    </span>
                    <span className="code-badge">{d.code}</span>
                    <span style={{ fontSize: 11, color: online ? 'var(--green)' : 'var(--t3)' }}>
                      {online ? '● Онлайн' : `○ ${timeAgo(d.last_seen)} назад`}
                    </span>
                    {(hasPerm('groups.edit_any') || hasPerm('groups.edit_own')) && (
                      <button className="btn btn-ghost btn-sm" title="Убрать из группы" onClick={() => removeDevice(d.id)}
                        style={{ padding: '2px 6px', opacity: 0.6 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {modal === 'edit' && (
        <GroupModal group={group} screens={screens} allDevices={allDevices} groupDeviceIds={group.members.map(d => d.id)}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); onRefresh(); }} />
      )}
      {modal === 'schedule' && (
        <ScheduleModal groupId={group.id} existing={group.schedule}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); onRefresh(); }} />
      )}
      {modal === 'addDevice' && (
        <AddDeviceModal groupId={group.id} freeDevices={allDevices.filter(d => !d.group_id)}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); onRefresh(); }} />
      )}
    </>
  );
}

// ── Страница ──────────────────────────────────────────────────────────────────

export default function GroupsPage() {
  const { hasPerm } = useAuth();
  const [groups, setGroups] = useState([]);
  const [screens, setScreens] = useState([]);
  const [allDevices, setAllDevices] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [, setTick] = useState(0);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, s, d] = await Promise.all([api.getGroups(), api.getScreens(), api.getDevices()]);
      setGroups(g);
      setScreens(s);
      setAllDevices(d);
    } catch (e) {
      if (e instanceof PermissionError) setDenied(true);
    }
  }, []);

  useEffect(() => {
    load();
    const a = setInterval(load, 10000);
    const b = setInterval(() => setTick(n => n + 1), 5000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [load]);

  const freeCount = allDevices.filter(d => !d.group_id).length;

  if (denied) return <AccessDenied />;

  return (
    <div>
      <div className="page-header">
        <div className="page-title-row">
          <h1 className="page-title">Группы</h1>
          <div className="page-sub">
            {groups.length} групп
            {freeCount > 0 && <span style={{ marginLeft: 8, color: 'var(--t3)' }}>· {freeCount} устр. без группы</span>}
          </div>
        </div>
        {hasPerm('groups.create') && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Новая группа
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 3H8M12 3v4" strokeLinecap="round" />
          </svg>
          <strong>Нет групп</strong>
          <p>Создайте группу чтобы управлять несколькими устройствами вместе</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map(g => (
            <GroupCard key={g.id} group={g} screens={screens} allDevices={allDevices} onRefresh={load} />
          ))}
        </div>
      )}

      {showCreate && (
        <GroupModal screens={screens} allDevices={allDevices} groupDeviceIds={[]}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); }} />
      )}
    </div>
  );
}
