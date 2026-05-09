import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { api } from '../api';

// ── API helpers ───────────────────────────────────────────────────────────────

const bapi = {
  getLocal:       () => api._req('GET',  '/backup/local'),
  deleteLocal:    (n) => api._req('DELETE', `/backup/local/${encodeURIComponent(n)}`),
  restore:        (n) => api._req('POST', `/backup/local/${encodeURIComponent(n)}/restore`),
  run:            () => api._req('POST', '/backup/run'),
  getSettings:    () => api._req('GET',  '/backup/settings'),
  saveSettings:   (d) => api._req('PUT',  '/backup/settings', d),
  getDests:       () => api._req('GET',  '/backup/destinations'),
  createDest:     (d) => api._req('POST', '/backup/destinations', d),
  updateDest:     (id, d) => api._req('PUT', `/backup/destinations/${id}`, d),
  deleteDest:     (id) => api._req('DELETE', `/backup/destinations/${id}`),
};

function fmtSize(b) {
  if (b > 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
  if (b > 1024) return (b / 1024).toFixed(0) + ' KB';
  return b + ' B';
}

function fmtDate(ms) {
  return new Date(ms).toLocaleString('ru-RU');
}

const TYPE_LABELS = { telegram: 'Telegram', url: 'URL', sftp: 'SFTP' };
const TYPE_COLORS = { telegram: '#229ED9', url: '#7C3AED', sftp: '#059669' };

const CRON_PRESETS = [
  { label: 'Каждый час',       value: '0 * * * *' },
  { label: 'Каждые 6 часов',   value: '0 */6 * * *' },
  { label: 'Каждый день в 3:00', value: '0 3 * * *' },
  { label: 'Каждую неделю',    value: '0 3 * * 0' },
];

// ── Форма назначения ──────────────────────────────────────────────────────────

function DestForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || { name: '', type: 'telegram', enabled: true, config: {} });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setCfg = (k, v) => setForm(f => ({ ...f, config: { ...f.config, [k]: v } }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Название</div>
          <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Мой бекап" />
        </div>
        <div style={{ width: 130 }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Тип</div>
          <select className="form-input" value={form.type} onChange={e => set('type', e.target.value)}>
            <option value="telegram">Telegram</option>
            <option value="url">URL</option>
            <option value="sftp">SFTP</option>
          </select>
        </div>
      </div>

      {form.type === 'telegram' && (
        <>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Bot Token</div>
            <input className="form-input" value={form.config.botToken || ''} onChange={e => setCfg('botToken', e.target.value)} placeholder="123456:ABC-DEF..." />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Chat ID</div>
            <input className="form-input" value={form.config.chatId || ''} onChange={e => setCfg('chatId', e.target.value)} placeholder="-1001234567890" />
          </div>
        </>
      )}

      {form.type === 'url' && (
        <>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>URL (POST multipart/form-data)</div>
            <input className="form-input" value={form.config.url || ''} onChange={e => setCfg('url', e.target.value)} placeholder="https://example.com/backup" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Secret (опционально, для X-DS-Signature)</div>
            <input className="form-input" value={form.config.secret || ''} onChange={e => setCfg('secret', e.target.value)} placeholder="hmac-секрет" />
          </div>
        </>
      )}

      {form.type === 'sftp' && (
        <>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Host</div>
              <input className="form-input" value={form.config.host || ''} onChange={e => setCfg('host', e.target.value)} placeholder="sftp.example.com" />
            </div>
            <div style={{ width: 80 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Port</div>
              <input className="form-input" type="number" value={form.config.port || 22} onChange={e => setCfg('port', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Username</div>
              <input className="form-input" value={form.config.username || ''} onChange={e => setCfg('username', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Password</div>
              <input className="form-input" type="password" value={form.config.password || ''} onChange={e => setCfg('password', e.target.value)} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Remote path</div>
            <input className="form-input" value={form.config.remotePath || '/backups'} onChange={e => setCfg('remotePath', e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Private key (PEM, опционально)</div>
            <textarea className="form-input" rows={3} value={form.config.privateKey || ''} onChange={e => setCfg('privateKey', e.target.value)} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }} />
          </div>
        </>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />
        Включён
      </label>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onCancel}>Отмена</button>
        <button className="btn btn-primary" onClick={() => onSave(form)}>Сохранить</button>
      </div>
    </div>
  );
}

// ── Главная страница ──────────────────────────────────────────────────────────

export default function BackupPage() {
  const { hasPerm } = useAuth();
  const canView    = hasPerm('backup.view');
  const canRun     = hasPerm('backup.run');
  const canManage  = hasPerm('backup.manage');
  const canRestore = hasPerm('backup.restore');

  const [locals,  setLocals]  = useState([]);
  const [dests,   setDests]   = useState([]);
  const [cron,    setCron]    = useState('');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [editDest, setEditDest] = useState(null); // null | 'new' | {id,...}
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const [loc, dst, cfg] = await Promise.all([bapi.getLocal(), bapi.getDests(), bapi.getSettings()]);
      setLocals(loc);
      setDests(dst);
      setCron(cfg.cron || '');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [canView]);

  useEffect(() => { load(); }, [load]);

  const handleRun = async () => {
    setRunning(true); setRunResult(null);
    try {
      const res = await bapi.run();
      setRunResult(res);
      load();
    } catch (e) { setError(e.message); }
    finally { setRunning(false); }
  };

  const handleSaveCron = async () => {
    try { await bapi.saveSettings({ cron: cron || null }); } catch (e) { setError(e.message); }
  };

  const [restoring, setRestoring] = useState(null);

  const handleDeleteLocal = async (name) => {
    if (!window.confirm(`Удалить ${name}?`)) return;
    try { await bapi.deleteLocal(name); load(); } catch (e) { setError(e.message); }
  };

  const handleRestore = async (name) => {
    if (!window.confirm(
      `Восстановить из "${name}"?\n\n` +
      `⚠️ Это заменит текущую базу данных и файлы.\n` +
      `Перед заменой автоматически создастся safety-бекап.\n` +
      `Сервер перезапустится — соединение прервётся на ~10 секунд.`
    )) return;
    setRestoring(name);
    try {
      await bapi.restore(name);
      // Сервер уходит в рестарт — ждём и перезагружаем страницу
      setTimeout(() => window.location.reload(), 8000);
    } catch (e) {
      setError(e.message);
      setRestoring(null);
    }
  };

  const handleDownload = (name) => {
    const token = localStorage.getItem('ds_token');
    fetch(`/api/backup/local/${encodeURIComponent(name)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name; a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  const handleSaveDest = async (form) => {
    try {
      if (form.id) await bapi.updateDest(form.id, form);
      else await bapi.createDest(form);
      setEditDest(null); load();
    } catch (e) { setError(e.message); }
  };

  const handleDeleteDest = async (id) => {
    if (!window.confirm('Удалить назначение?')) return;
    try { await bapi.deleteDest(id); load(); } catch (e) { setError(e.message); }
  };

  const handleToggleDest = async (dest) => {
    try { await bapi.updateDest(dest.id, { enabled: !dest.enabled }); load(); } catch (e) { setError(e.message); }
  };

  if (!canView) return <div style={{ padding: 32, color: 'var(--t3)' }}>Нет доступа</div>;

  return (
    <div className="page-content" style={{ maxWidth: 860 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Бекапы</div>
          <div className="page-subtitle">Резервное копирование базы данных и файлов</div>
        </div>
        {canRun && (
          <button className="btn btn-primary" onClick={handleRun} disabled={running} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {running ? 'Создаётся...' : 'Создать бекап'}
          </button>
        )}
      </div>

      {restoring && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 8, background: 'rgba(234,179,8,0.1)', border: '1px solid #ca8a04', color: '#ca8a04', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          <span>Восстановление из <b>{restoring}</b>... Сервер перезапустится, страница обновится автоматически.</span>
        </div>
      )}

      {error && <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid var(--red)', color: 'var(--red)', fontSize: 13 }}>{error}<button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>×</button></div>}

      {runResult && (
        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Бекап создан: {runResult.file} ({fmtSize(runResult.size)})</div>
          {runResult.results.map((r, i) => (
            <div key={i} style={{ color: r.ok ? 'var(--green)' : 'var(--red)' }}>
              {r.ok ? '✓' : '✗'} {TYPE_LABELS[r.type]}{r.name ? ` (${r.name})` : ''}{!r.ok && `: ${r.error}`}
            </div>
          ))}
        </div>
      )}

      {/* Расписание */}
      {canManage && (
        <div style={{ marginBottom: 24, padding: '16px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Расписание (cron)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {CRON_PRESETS.map(p => (
              <button key={p.value} onClick={() => setCron(p.value)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: cron === p.value ? 'var(--a1)' : 'var(--surface3)', border: '1px solid var(--border)', color: cron === p.value ? '#fff' : 'var(--t2)' }}>{p.label}</button>
            ))}
            <button onClick={() => setCron('')} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: !cron ? 'var(--surface3)' : 'transparent', border: '1px solid var(--border)', color: 'var(--t3)' }}>Выключить</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" value={cron} onChange={e => setCron(e.target.value)} placeholder="0 3 * * * — или выберите выше" style={{ flex: 1, fontFamily: 'monospace' }} />
            <button className="btn btn-primary" onClick={handleSaveCron}>Сохранить</button>
          </div>
          {cron && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--t3)' }}>Текущее расписание: <code>{cron}</code></div>}
        </div>
      )}

      {/* Назначения */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Назначения отправки</div>
          {canManage && <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setEditDest('new')}>+ Добавить</button>}
        </div>

        {editDest && (
          <div style={{ marginBottom: 16, padding: 16, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>{editDest === 'new' ? 'Новое назначение' : 'Редактировать'}</div>
            <DestForm
              initial={editDest !== 'new' ? editDest : undefined}
              onSave={handleSaveDest}
              onCancel={() => setEditDest(null)}
            />
          </div>
        )}

        {dests.length === 0 && !editDest && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--t3)', fontSize: 13, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            Нет назначений. Бекапы сохраняются только локально.
          </div>
        )}

        {dests.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 6, background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', opacity: d.enabled ? 1 : 0.5 }}>
            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, color: '#fff', background: TYPE_COLORS[d.type] || 'var(--a1)' }}>{TYPE_LABELS[d.type]}</span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{d.name}</span>
            {canManage && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => handleToggleDest(d)} style={{ padding: '4px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer', background: d.enabled ? 'var(--surface3)' : 'var(--a1)', border: '1px solid var(--border)', color: d.enabled ? 'var(--t2)' : '#fff' }}>{d.enabled ? 'Выкл' : 'Вкл'}</button>
                <button onClick={() => setEditDest(d)} style={{ padding: '4px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer', background: 'var(--surface3)', border: '1px solid var(--border)', color: 'var(--t2)' }}>Изменить</button>
                <button onClick={() => handleDeleteDest(d.id)} style={{ padding: '4px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer', background: 'transparent', border: '1px solid var(--red)', color: 'var(--red)' }}>Удалить</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Локальные бекапы */}
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
          Локальные бекапы {locals.length > 0 && <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 12 }}>({locals.length})</span>}
        </div>

        {loading && <div style={{ color: 'var(--t3)', fontSize: 13 }}>Загрузка...</div>}

        {locals.length === 0 && !loading && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--t3)', fontSize: 13, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            Нет локальных бекапов
          </div>
        )}

        {locals.map(f => (
          <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 6, background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span style={{ flex: 1, fontSize: 13, fontFamily: 'monospace' }}>{f.name}</span>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>{fmtSize(f.size)}</span>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>{fmtDate(f.createdAt)}</span>
            <button onClick={() => handleDownload(f.name)} style={{ padding: '4px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer', background: 'var(--surface3)', border: '1px solid var(--border)', color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Скачать
            </button>
            {canRestore && (
              <button
                onClick={() => handleRestore(f.name)}
                disabled={!!restoring}
                style={{ padding: '4px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer', background: restoring === f.name ? 'rgba(234,179,8,0.15)' : 'rgba(234,179,8,0.08)', border: '1px solid #ca8a04', color: '#ca8a04', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                {restoring === f.name ? 'Восстановление...' : 'Восстановить'}
              </button>
            )}
            {canManage && (
              <button onClick={() => handleDeleteLocal(f.name)} disabled={!!restoring} style={{ padding: '4px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer', background: 'transparent', border: '1px solid var(--red)', color: 'var(--red)' }}>Удалить</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
