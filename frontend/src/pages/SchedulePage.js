import React, { useEffect, useState } from 'react';
import { api } from '../api';

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function X() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function DaysBadges({ days }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {DAY_LABELS.map((label, i) => (
        <span key={i} style={{
          fontSize: 10,
          fontWeight: 600,
          padding: '2px 5px',
          borderRadius: 4,
          background: days[i] === '1' ? 'var(--accent)' : 'var(--surface2)',
          color: days[i] === '1' ? '#fff' : 'var(--t3)',
          opacity: days[i] === '1' ? 1 : 0.5,
        }}>
          {label}
        </span>
      ))}
    </span>
  );
}

function ScheduleModal({ devices, onClose, onSaved }) {
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? '');
  const [days, setDays] = useState('1111100');
  const [onTime, setOnTime] = useState('08:00');
  const [offTime, setOffTime] = useState('22:00');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function toggleDay(i) {
    setDays(d => d.slice(0, i) + (d[i] === '1' ? '0' : '1') + d.slice(i + 1));
  }

  async function submit(e) {
    e.preventDefault();
    if (!deviceId) { setError('Выберите устройство'); return; }
    setLoading(true);
    setError('');
    try {
      await api.createSchedule({ device_id: deviceId, days, on_time: onTime, off_time: offTime, enabled });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={e => { e._mdTarget = e.target; }}
      onMouseUp={e => { if (e._mdTarget === e.currentTarget && e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal" style={{ width: 460 }}>
        <div className="modal-header">
          <h2>Новое расписание</h2>
          <button className="modal-close" onClick={onClose}><X /></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && (
              <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12,
                background: 'rgba(224,82,82,0.1)', padding: '8px 12px', borderRadius: 8 }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label>Устройство</label>
              <select value={deviceId} onChange={e => setDeviceId(e.target.value)} required>
                <option value="">— выберите устройство —</option>
                {devices.map(d => (
                  <option key={d.id} value={d.id}>{d.name || d.code}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Дни недели</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    style={{
                      padding: '5px 11px',
                      borderRadius: 6,
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 12,
                      background: days[i] === '1' ? 'var(--accent)' : 'var(--surface2)',
                      color: days[i] === '1' ? '#fff' : 'var(--t2)',
                      transition: 'background 0.15s',
                    }}
                  >
                    {label}
                  </button>
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
                <button
                  type="button"
                  className={`theme-switch${enabled ? ' on' : ''}`}
                  onClick={() => setEnabled(v => !v)}
                  aria-label="Включить расписание"
                >
                  <span className="theme-switch-knob" />
                </button>
              </label>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Сохранение...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SchedulePage() {
  const [schedules, setSchedules] = useState([]);
  const [devices, setDevices] = useState([]);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    const [s, d] = await Promise.all([api.getSchedules(), api.getDevices()]);
    setSchedules(s);
    setDevices(d);
  };

  useEffect(() => { load(); }, []);

  async function toggleEnabled(sch) {
    await api.updateSchedule(sch.id, { enabled: !sch.enabled });
    load();
  }

  async function del(id) {
    if (!window.confirm('Удалить расписание?')) return;
    await api.deleteSchedule(id);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title-row">
          <h1 className="page-title">Расписания</h1>
          <div className="page-sub">{schedules.length} расписаний</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Добавить расписание
        </button>
      </div>

      {schedules.length === 0 ? (
        <div className="empty-state">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" strokeLinecap="round" />
          </svg>
          <strong>Нет расписаний</strong>
          <p>Добавьте расписание включения и выключения для устройств</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {schedules.map(sch => (
            <div key={sch.id} className="list-row" style={{ opacity: sch.enabled ? 1 : 0.55 }}>
              <div className={`icon-box ${sch.enabled ? 'ib-green' : 'ib-muted'}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke={sch.enabled ? 'var(--green)' : 'var(--t3)'} strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" strokeLinecap="round" />
                </svg>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t1)', marginBottom: 4 }}>
                  {sch.device_name || sch.device_code}
                  <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--t3)', marginLeft: 8 }}>
                    {sch.device_code}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <DaysBadges days={sch.days} />
                  <span style={{ fontSize: 12, color: 'var(--t2)', fontWeight: 600 }}>
                    {sch.on_time} — {sch.off_time}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  className={`theme-switch${sch.enabled ? ' on' : ''}`}
                  onClick={() => toggleEnabled(sch)}
                  aria-label={sch.enabled ? 'Отключить' : 'Включить'}
                  title={sch.enabled ? 'Отключить расписание' : 'Включить расписание'}
                >
                  <span className="theme-switch-knob" />
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => del(sch.id)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ScheduleModal
          devices={devices}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}
