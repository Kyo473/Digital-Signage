import React, { useEffect, useState } from 'react';
import { api, PermissionError } from '../api';
import { useAuth } from '../AuthContext';
import AccessDenied from '../components/AccessDenied';

function X() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>;
}

function ScreenModal({ screen, playlists, scenes, onClose, onSaved }) {
  const [name, setName] = useState(screen?.name ?? '');
  // value format: "playlist:<id>", "scene:<id>", or ""
  const initValue = screen?.playlist_id ? `playlist:${screen.playlist_id}`
    : screen?.scene_id ? `scene:${screen.scene_id}` : '';
  const [selected, setSelected] = useState(initValue);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault(); setLoading(true);
    try {
      if (screen) {
        const playlist_id = selected.startsWith('playlist:') ? selected.slice(9) : null;
        const scene_id = selected.startsWith('scene:') ? selected.slice(6) : null;
        await api.updateScreen(screen.id, { name, playlist_id, scene_id });
      } else {
        await api.createScreen({ name });
      }
      onSaved();
    } finally { setLoading(false); }
  }

  return (
    <div className="modal-backdrop"
      onMouseDown={e => { e._mdTarget = e.target; }}
      onMouseUp={e => { if (e._mdTarget === e.currentTarget && e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 440 }}>
        <div className="modal-header">
          <h2>{screen ? 'Настройки экрана' : 'Новый экран'}</h2>
          <button className="modal-close" onClick={onClose}><X /></button>
        </div>
        <div className="modal-body">
          <form id="screen-form" onSubmit={submit}>
            <div className="form-group">
              <label>Название</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Экран 1" autoFocus required />
            </div>
            {screen && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Контент</label>
                <select value={selected} onChange={e => setSelected(e.target.value)}>
                  <option value="">— не назначен —</option>
                  {playlists.length > 0 && (
                    <optgroup label="Плейлисты">
                      {playlists.map(p => <option key={p.id} value={`playlist:${p.id}`}>{p.name}</option>)}
                    </optgroup>
                  )}
                  {scenes.length > 0 && (
                    <optgroup label="Сцены">
                      {scenes.map(s => <option key={s.id} value={`scene:${s.id}`}>{s.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
            )}
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" form="screen-form" type="submit" disabled={loading || !name.trim()}>
            {screen ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ScreensPage() {
  const { hasPerm } = useAuth();
  const [screens, setScreens] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [modal, setModal] = useState(null);
  const [copied, setCopied] = useState(null);
  const [denied, setDenied] = useState(false);

  const load = async () => {
    try {
      const [s, p, sc] = await Promise.all([api.getScreens(), api.getPlaylists(), api.getScenes()]);
      setScreens(s); setPlaylists(p); setScenes(sc);
    } catch (e) {
      if (e instanceof PermissionError) setDenied(true);
    }
  };
  useEffect(() => { load(); }, []);

  async function del(id) {
    if (!window.confirm('Удалить экран?')) return;
    try { await api.deleteScreen(id); load(); }
    catch (e) { if (!(e instanceof PermissionError)) console.error(e); }
  }

  if (denied) return <AccessDenied />;

  const assignedLabel = (s) => {
    if (s.playlist_id) return { label: playlists.find(p => p.id === s.playlist_id)?.name ?? '...', isScene: false };
    if (s.scene_id) return { label: scenes.find(sc => sc.id === s.scene_id)?.name ?? '...', isScene: true };
    return null;
  };
  const playerUrl = id => `${window.location.origin}/player/${id}`;

  function copy(text, id) {
    const done = () => { setCopied(id); setTimeout(() => setCopied(null), 1600); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => { fb(text); done(); });
    else { fb(text); done(); }
  }
  function fb(t) {
    const el = document.createElement('textarea'); el.value = t;
    el.style.cssText = 'position:fixed;top:-999px'; document.body.appendChild(el);
    el.select(); document.execCommand('copy'); document.body.removeChild(el);
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title-row">
          <h1 className="page-title">Экраны</h1>
          <div className="page-sub">{screens.length} экранов</div>
        </div>
        {hasPerm('screens.create') && (
          <button className="btn btn-primary" onClick={() => setModal('create')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Добавить экран
          </button>
        )}
      </div>

      {screens.length === 0 ? (
        <div className="empty-state">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
          <strong>Нет экранов</strong>
          <p>Создайте экран и назначьте плейлист для воспроизведения</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {screens.map(s => (
            <div key={s.id} className="list-row">
              <div className="icon-box ib-blue">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(99,150,255,0.9)" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3, color: 'var(--t1)' }}>{s.name}</div>
                <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {(() => {
                    const a = assignedLabel(s);
                    if (!a) return <span style={{ color: 'var(--t3)' }}>Не назначен</span>;
                    return (
                      <>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                          background: a.isScene ? '#10b981' : 'var(--a1)',
                          boxShadow: a.isScene ? '0 0 6px rgba(16,185,129,0.6)' : '0 0 6px rgba(124,92,252,0.6)',
                          display: 'inline-block',
                        }} />
                        <span style={{ color: 'var(--t2)' }}>{a.label}</span>
                        {a.isScene && <span style={{ fontSize: 10, background: 'rgba(16,185,129,0.12)', color: '#10b981', borderRadius: 4, padding: '1px 5px' }}>сцена</span>}
                      </>
                    );
                  })()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <a href={playerUrl(s.id)} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Плеер
                </a>
                {hasPerm('screens.edit_any') && <>
                  <button className="btn btn-ghost btn-sm" onClick={() => api.sendCommand(s.id, 'prev').catch(() => {})} title="Назад">⏮</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => api.sendCommand(s.id, 'pause').catch(() => {})} title="Пауза">⏸</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => api.sendCommand(s.id, 'next').catch(() => {})} title="Вперёд">⏭</button>
                </>}
                <button className="btn btn-ghost btn-sm" onClick={() => copy(playerUrl(s.id), s.id)} style={{ minWidth: 96 }}>
                  {copied === s.id
                    ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--a2)" strokeWidth="3" strokeLinecap="round"><path d="M20 6 9 17l-5-5"/></svg> Скопировано</>
                    : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Ссылка</>
                  }
                </button>
                {(hasPerm('screens.edit_any') || hasPerm('screens.edit_own')) && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setModal(s)}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    Настройки
                  </button>
                )}
                {(hasPerm('screens.delete_any') || hasPerm('screens.delete_own')) && (
                  <button className="btn btn-danger btn-sm" onClick={() => del(s.id)}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6M14 11v6"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ScreenModal
          screen={modal === 'create' ? null : modal}
          playlists={playlists}
          scenes={scenes}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
