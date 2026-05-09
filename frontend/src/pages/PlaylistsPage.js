import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, PermissionError } from '../api';
import { useAuth } from '../AuthContext';
import AccessDenied from '../components/AccessDenied';

function X() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>;
}

function NameModal({ title, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const mouseDownTarget = React.useRef(null);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try { await onSaved(name.trim()); } finally { setLoading(false); }
  }

  return (
    <div className="modal-backdrop"
      onMouseDown={e => { mouseDownTarget.current = e.target; }}
      onMouseUp={e => { if (mouseDownTarget.current === e.currentTarget && e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 420 }}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}><X /></button>
        </div>
        <div className="modal-body">
          <form id="name-form" onSubmit={submit}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Название</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Моё название" autoFocus required />
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" form="name-form" type="submit" disabled={loading || !name.trim()}>
            Создать
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlaylistsPage() {
  const { hasPerm } = useAuth();
  const [playlists, setPlaylists] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [tab, setTab] = useState('playlists');
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [showCreateScene, setShowCreateScene] = useState(false);
  const [denied, setDenied] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const [pl, sc] = await Promise.all([api.getPlaylists(), api.getScenes()]);
      setPlaylists(pl);
      setScenes(sc);
    } catch (e) {
      if (e instanceof PermissionError) setDenied(true);
    }
  };
  useEffect(() => { load(); }, []);

  async function delPlaylist(id, e) {
    e.stopPropagation();
    if (!window.confirm('Удалить плейлист?')) return;
    try { await api.deletePlaylist(id); load(); }
    catch (e) { if (!(e instanceof PermissionError)) console.error(e); }
  }

  async function dupPlaylist(id, e) {
    e.stopPropagation();
    try { await api.duplicatePlaylist(id); load(); }
    catch (e) { if (!(e instanceof PermissionError)) console.error(e); }
  }

  async function delScene(id, e) {
    e.stopPropagation();
    if (!window.confirm('Удалить сцену?')) return;
    try { await api.deleteScene(id); load(); }
    catch (e) { if (!(e instanceof PermissionError)) console.error(e); }
  }

  async function dupScene(id, e) {
    e.stopPropagation();
    try { await api.duplicateScene(id); load(); }
    catch (e) { if (!(e instanceof PermissionError)) console.error(e); }
  }

  if (denied) return <AccessDenied />;

  const list = tab === 'playlists' ? playlists : scenes;

  return (
    <div>
      <div className="page-header">
        <div className="page-title-row">
          <h1 className="page-title">Плейлисты</h1>
          <div className="page-sub">{playlists.length} плейлист{playlists.length === 1 ? '' : playlists.length >= 2 && playlists.length <= 4 ? 'а' : 'ов'} · {scenes.length} сцен{scenes.length === 1 ? 'а' : scenes.length >= 2 && scenes.length <= 4 ? 'ы' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {hasPerm('scenes.create') && (
            <button className="btn btn-ghost" onClick={() => setShowCreateScene(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              Новая сцена
            </button>
          )}
          {hasPerm('playlists.create') && (
            <button className="btn btn-primary" onClick={() => setShowCreatePlaylist(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              Новый плейлист
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: 'var(--surface2)', borderRadius: 'var(--r)', padding: 3, width: 'fit-content' }}>
        {[['playlists', 'Плейлисты', playlists.length], ['scenes', 'Сцены', scenes.length]].map(([key, label, count]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding: '6px 16px', borderRadius: 'calc(var(--r) - 2px)', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s, color 0.15s', background: tab === key ? 'var(--a1)' : 'transparent', color: tab === key ? '#fff' : 'var(--t2)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {label}
            <span style={{ background: tab === key ? 'rgba(255,255,255,0.25)' : 'var(--surface)', borderRadius: 10, padding: '0 6px', fontSize: 11 }}>{count}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="empty-state">
          {tab === 'playlists' ? (
            <>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M3 6h18M3 12h18M3 18h12"/><circle cx="19" cy="18" r="2"/></svg>
              <strong>Нет плейлистов</strong>
              <p>Создайте плейлист и настройте тайминги для контента и сцен</p>
              <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => setShowCreatePlaylist(true)}>Создать плейлист</button>
            </>
          ) : (
            <>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="2" y="2" width="20" height="20" rx="3"/><rect x="7" y="7" width="5" height="5" rx="1"/><rect x="14" y="7" width="3" height="3" rx="1"/><rect x="14" y="12" width="3" height="5" rx="1"/><rect x="7" y="14" width="5" height="3" rx="1"/></svg>
              <strong>Нет сцен</strong>
              <p>Сцена — это холст с несколькими объектами (видео, фото, веб-страницы)</p>
              <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => setShowCreateScene(true)}>Создать сцену</button>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tab === 'playlists' && playlists.map(p => (
            <div key={p.id} className="list-row" style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/playlists/${p.id}`)}>
              <div className="icon-box ib-purple">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--a1)" strokeWidth="2">
                  <path d="M3 6h18M3 12h18M3 18h12"/><circle cx="19" cy="18" r="2"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, color: 'var(--t1)' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                  Создан {new Date(p.created_at * 1000).toLocaleDateString('ru')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                {hasPerm('playlists.create') && (
                  <button className="btn btn-ghost btn-sm" title="Дублировать" onClick={e => dupPlaylist(p.id, e)}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </button>
                )}
                {(hasPerm('playlists.edit_any') || hasPerm('playlists.edit_own')) && (
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/playlists/${p.id}`)}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Редактировать
                  </button>
                )}
                {(hasPerm('playlists.delete_any') || hasPerm('playlists.delete_own')) && (
                  <button className="btn btn-danger btn-sm" onClick={e => delPlaylist(p.id, e)}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                )}
              </div>
            </div>
          ))}

          {tab === 'scenes' && scenes.map(s => (
            <div key={s.id} className="list-row" style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/scenes/${s.id}`)}>
              <div className="icon-box" style={{ background: 'rgba(16,185,129,0.12)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="20" rx="3"/>
                  <rect x="6" y="6" width="5" height="5" rx="1"/>
                  <rect x="13" y="6" width="5" height="5" rx="1"/>
                  <rect x="6" y="13" width="12" height="5" rx="1"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, color: 'var(--t1)' }}>{s.name}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                  {s.width}×{s.height} · Создана {new Date(s.created_at * 1000).toLocaleDateString('ru')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                {hasPerm('scenes.create') && (
                  <button className="btn btn-ghost btn-sm" title="Дублировать" onClick={e => dupScene(s.id, e)}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </button>
                )}
                {(hasPerm('scenes.edit_any') || hasPerm('scenes.edit_own')) && (
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/scenes/${s.id}`)}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Редактировать
                  </button>
                )}
                {(hasPerm('scenes.delete_any') || hasPerm('scenes.delete_own')) && (
                  <button className="btn btn-danger btn-sm" onClick={e => delScene(s.id, e)}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreatePlaylist && (
        <NameModal title="Новый плейлист" onClose={() => setShowCreatePlaylist(false)}
          onSaved={async (name) => { await api.createPlaylist({ name }); setShowCreatePlaylist(false); load(); }} />
      )}
      {showCreateScene && (
        <NameModal title="Новая сцена" onClose={() => setShowCreateScene(false)}
          onSaved={async (name) => {
            const scene = await api.createScene({ name });
            setShowCreateScene(false);
            load();
            navigate(`/scenes/${scene.id}`);
          }} />
      )}
    </div>
  );
}
