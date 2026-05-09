import React, { useEffect, useState, useCallback } from 'react';
import { api, PermissionError } from '../api';
import { useAuth } from '../AuthContext';
import AccessDenied from '../components/AccessDenied';

const ALL_EVENTS = [
  { key: 'device.online',     label: 'Устройство онлайн',       group: 'Устройства' },
  { key: 'content.created',   label: 'Контент добавлен',         group: 'Контент' },
  { key: 'content.deleted',   label: 'Контент удалён',           group: 'Контент' },
  { key: 'playlist.created',  label: 'Плейлист создан',          group: 'Плейлисты' },
  { key: 'playlist.updated',  label: 'Плейлист обновлён',        group: 'Плейлисты' },
  { key: 'playlist.deleted',  label: 'Плейлист удалён',          group: 'Плейлисты' },
  { key: 'screen.updated',    label: 'Экран обновлён',           group: 'Экраны' },
  { key: 'user.created',      label: 'Пользователь создан',      group: 'Пользователи' },
  { key: 'user.deleted',      label: 'Пользователь удалён',      group: 'Пользователи' },
];

const EVENT_GROUPS = [...new Set(ALL_EVENTS.map(e => e.group))];

function StatusDot({ ok }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
      background: ok ? '#10b981' : 'var(--t3)',
      boxShadow: ok ? '0 0 6px #10b981' : 'none',
    }} />
  );
}

// ── Модалка создания/редактирования вебхука ────────────────────────────────
function WebhookModal({ hook, onClose, onSave }) {
  const isEdit = !!hook;
  const [name, setName]     = useState(hook?.name || '');
  const [url, setUrl]       = useState(hook?.url || '');
  const [secret, setSecret] = useState(hook?.secret || '');
  const [events, setEvents] = useState(new Set(hook?.events || []));
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const toggleEvent = key =>
    setEvents(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const toggleGroup = group => {
    const groupKeys = ALL_EVENTS.filter(e => e.group === group).map(e => e.key);
    const allOn = groupKeys.every(k => events.has(k));
    setEvents(prev => {
      const n = new Set(prev);
      groupKeys.forEach(k => allOn ? n.delete(k) : n.add(k));
      return n;
    });
  };

  const submit = async () => {
    if (!name.trim()) { setError('Укажите название'); return; }
    if (!url.trim() || !url.startsWith('http')) { setError('Укажите корректный URL'); return; }
    setError(''); setSaving(true);
    try {
      const data = { name, url, secret, events: [...events] };
      if (isEdit) await api.updateWebhook(hook.id, data);
      else await api.createWebhook(data);
      onSave();
    } catch (e) {
      try { setError(JSON.parse(e.message).error); } catch { setError(e.message); }
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? 'Редактировать вебхук' : 'Новый вебхук'}</h2>
          <button className="modal-close" onClick={onClose}>&#x2715;</button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          <div className="form-group">
            <label>Название</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Например: Slack уведомления" autoFocus />
          </div>
          <div className="form-group">
            <label>URL</label>
            <input className="form-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://hooks.slack.com/..." />
          </div>
          <div className="form-group">
            <label>Секрет HMAC (необязательно)</label>
            <input className="form-input" value={secret} onChange={e => setSecret(e.target.value)} placeholder="Для верификации подписи X-DS-Signature" />
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
              Если указан — в заголовке <code>X-DS-Signature</code> будет HMAC-SHA256 подпись тела запроса
            </div>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            События
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--t3)', textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>
              {events.size === 0 ? 'все события' : `выбрано ${events.size}`}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {EVENT_GROUPS.map(group => {
              const groupEvents = ALL_EVENTS.filter(e => e.group === group);
              const allOn = groupEvents.every(e => events.has(e.key));
              const someOn = groupEvents.some(e => events.has(e.key));
              return (
                <div key={group} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: someOn ? 'var(--accent-soft)' : 'var(--surface2)', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                    onClick={() => toggleGroup(group)}
                  >
                    <input type="checkbox" className="native-cb" checked={allOn}
                      ref={el => { if (el) el.indeterminate = someOn && !allOn; }}
                      onChange={() => toggleGroup(group)}
                      onClick={e => e.stopPropagation()}
                      style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--a1)', flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: someOn ? 'var(--a1)' : 'var(--t1)' }}>{group}</span>
                  </div>
                  <div style={{ padding: '6px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {groupEvents.map(ev => {
                      const on = events.has(ev.key);
                      return (
                        <label key={ev.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 10px', borderRadius: 20, border: '1px solid ' + (on ? 'var(--a1)' : 'var(--border)'), background: on ? 'var(--accent-soft)' : 'transparent', fontSize: 12, transition: 'all 0.1s' }}>
                          <input type="checkbox" className="native-cb" checked={on} onChange={() => toggleEvent(ev.key)}
                            style={{ width: 13, height: 13, cursor: 'pointer', accentColor: 'var(--a1)', flexShrink: 0, display: 'inline-block' }} />
                          <span style={{ color: on ? 'var(--a1)' : 'var(--t2)', fontWeight: on ? 600 : 400 }}>{ev.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 8 }}>
            Если ни одно событие не выбрано — вебхук получит все события
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Основная страница ──────────────────────────────────────────────────────
export default function IntegrationsPage() {
  const { hasPerm } = useAuth();
  const [hooks, setHooks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied]   = useState(false);
  const [modal, setModal]     = useState(null); // null | 'create' | hook object
  const [testing, setTesting] = useState(null); // hook id being tested
  const [testResults, setTestResults] = useState({}); // id -> { ok, message }

  const load = useCallback(async () => {
    try {
      const data = await api.getWebhooks();
      setHooks(data);
    } catch (e) {
      if (e instanceof PermissionError) setDenied(true);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const del = async hook => {
    if (!window.confirm('Удалить вебхук «' + hook.name + '»?')) return;
    try { await api.deleteWebhook(hook.id); setHooks(h => h.filter(x => x.id !== hook.id)); }
    catch (e) { if (!(e instanceof PermissionError)) { try { alert(JSON.parse(e.message).error); } catch { alert(e.message); } } }
  };

  const toggleEnabled = async hook => {
    try {
      await api.updateWebhook(hook.id, { enabled: hook.enabled ? 0 : 1 });
      setHooks(h => h.map(x => x.id === hook.id ? { ...x, enabled: x.enabled ? 0 : 1 } : x));
    } catch (e) { if (!(e instanceof PermissionError)) alert(e.message); }
  };

  const testHook = async hook => {
    setTesting(hook.id);
    try {
      const result = await api.testWebhook(hook.id);
      setTestResults(r => ({ ...r, [hook.id]: { ok: true, message: 'Успешно! Статус: ' + (result.status || '200') } }));
    } catch (e) {
      let msg = e.message;
      try { msg = JSON.parse(e.message).error; } catch {}
      setTestResults(r => ({ ...r, [hook.id]: { ok: false, message: msg } }));
    } finally {
      setTesting(null);
      setTimeout(() => setTestResults(r => { const n = { ...r }; delete n[hook.id]; return n; }), 5000);
    }
  };

  if (loading) return <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--t3)' }}>Загрузка...</div>;
  if (denied)  return <AccessDenied />;

  const canEdit = hasPerm('integrations.manage');

  return (
    <div>
      {/* Шапка */}
      <div className="page-header">
        <div className="page-title-row">
          <h1 className="page-title">Интеграции</h1>
          <div className="page-sub">{hooks.length} вебхуков</div>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setModal('create')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Добавить вебхук
          </button>
        )}
      </div>

      {/* Инфо-блок */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--a1)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6 }}>
          <b style={{ color: 'var(--t1)' }}>Webhooks</b> — система отправляет HTTP POST запросы на указанные URL при наступлении событий.
          Тело запроса — JSON: <code style={{ background: 'var(--surface2)', padding: '0 4px', borderRadius: 4, fontSize: 12 }}>{`{"event":"...", "timestamp":"...", "data":{...}}`}</code>.
          Если задан секрет — заголовок <code style={{ background: 'var(--surface2)', padding: '0 4px', borderRadius: 4, fontSize: 12 }}>X-DS-Signature</code> содержит HMAC-SHA256 подпись.
        </div>
      </div>

      {/* Список вебхуков */}
      {hooks.length === 0 ? (
        <div className="empty-state">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          <strong>Нет вебхуков</strong>
          <p>Добавьте вебхук чтобы получать уведомления о событиях</p>
          {canEdit && <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => setModal('create')}>Добавить</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {hooks.map(hook => {
            const hookEvents = Array.isArray(hook.events) ? hook.events : JSON.parse(hook.events || '[]');
            const testRes = testResults[hook.id];
            return (
              <div key={hook.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* Статус */}
                  <div style={{ marginTop: 4 }}>
                    <StatusDot ok={!!hook.enabled} />
                  </div>

                  {/* Инфо */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--t1)' }}>{hook.name}</span>
                      {!hook.enabled && (
                        <span style={{ fontSize: 10, background: 'var(--surface2)', color: 'var(--t3)', borderRadius: 4, padding: '1px 6px', border: '1px solid var(--border)' }}>отключён</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ verticalAlign: 'middle', marginRight: 4 }}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                      {hook.url}
                    </div>

                    {/* Теги событий */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {hookEvents.length === 0 ? (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(124,92,252,0.1)', color: 'var(--a1)', border: '1px solid rgba(124,92,252,0.3)' }}>
                          все события
                        </span>
                      ) : hookEvents.map(ev => {
                        const evInfo = ALL_EVENTS.find(e => e.key === ev);
                        return (
                          <span key={ev} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--surface2)', color: 'var(--t2)', border: '1px solid var(--border)' }}>
                            {evInfo?.label || ev}
                          </span>
                        );
                      })}
                    </div>

                    {/* Результат теста */}
                    {testRes && (
                      <div style={{ marginTop: 8, fontSize: 12, color: testRes.ok ? '#10b981' : 'var(--red)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          {testRes.ok ? <path d="M20 6 9 17l-5-5"/> : <><path d="M18 6 6 18"/><path d="M6 6l12 12"/></>}
                        </svg>
                        {testRes.message}
                      </div>
                    )}
                  </div>

                  {/* Действия */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => testHook(hook)}
                      disabled={testing === hook.id}
                      title="Отправить тестовый запрос"
                    >
                      {testing === hook.id ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      )}
                      Тест
                    </button>
                    {canEdit && (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleEnabled(hook)} title={hook.enabled ? 'Отключить' : 'Включить'}>
                          {hook.enabled ? (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="16" cy="12" r="3" fill="currentColor"/></svg>
                          ) : (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="8" cy="12" r="3" fill="currentColor"/></svg>
                          )}
                          {hook.enabled ? 'Откл.' : 'Вкл.'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setModal(hook)}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
                          Изменить
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => del(hook)}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(modal === 'create' || (modal && typeof modal === 'object')) && (
        <WebhookModal
          hook={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
