import React, { useEffect, useState, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { api, PermissionError } from '../api';
import { useAuth } from '../AuthContext';
import AccessDenied from '../components/AccessDenied';

const TYPE_LABELS = { image: 'Фото', video: 'Видео', webpage: 'Веб', html: 'HTML', pdf: 'PDF', scene: 'Сцена' };
const TYPE_COLORS = { image: '#7c5cfc', video: '#e05c8a', webpage: '#2eaadc', html: '#f59e0b', pdf: '#ef4444', scene: '#10b981' };

// Pixels per second on the timeline ruler
const PX_PER_SEC = 15;
const MIN_DURATION = 1;
const RULER_HEIGHT = 28;
const TRACK_HEIGHT = 64;
const TRACK_PADDING = 8;

function X() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>;
}

function formatTime(sec) {
  const total = Math.round(sec * 10) / 10;
  const m = Math.floor(total / 60);
  const s = Math.round((total % 60) * 10) / 10;
  return m > 0 ? `${m}м ${s}с` : `${s}с`;
}

// ── Add item modal ────────────────────────────────────────────────────────────
function AddItemModal({ playlistId, onClose, onSaved }) {
  const [content, setContent] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [tab, setTab] = useState('content');
  const [selected, setSelected] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const mouseDownTarget = useRef(null);

  useEffect(() => {
    api.getContent().then(setContent);
    api.getScenes().then(setScenes);
  }, []);

  async function add() {
    if (!selected) return;
    setLoading(true);
    try {
      const data = selectedType === 'scene'
        ? { scene_id: selected }
        : { content_id: selected };
      await api.addItem(playlistId, data);
      onSaved();
    } finally { setLoading(false); }
  }

  const list = tab === 'content' ? content : scenes;
  const filtered = list.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="modal-backdrop"
      onMouseDown={e => { mouseDownTarget.current = e.target; }}
      onMouseUp={e => { if (mouseDownTarget.current === e.currentTarget && e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 540, display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
        <div className="modal-header">
          <h2>Добавить в плейлист</h2>
          <button className="modal-close" onClick={onClose}><X /></button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, background: 'var(--surface)', borderRadius: 'var(--r)', padding: 3 }}>
            {[['content', 'Контент'], ['scene', 'Сцены']].map(([key, label]) => (
              <button key={key} onClick={() => { setTab(key); setSelected(null); }}
                style={{ flex: 1, padding: '6px 12px', borderRadius: 'calc(var(--r) - 2px)', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s, color 0.15s', background: tab === key ? 'var(--a1)' : 'transparent', color: tab === key ? '#fff' : 'var(--t2)' }}>
                {label}
              </button>
            ))}
          </div>
          <input className="form-input" placeholder="Поиск..." value={filter} onChange={e => setFilter(e.target.value)} style={{ marginBottom: 10 }} autoFocus />
          {filtered.length === 0 ? (
            <div style={{ color: 'var(--t3)', textAlign: 'center', padding: '32px 0', fontSize: 13 }}>
              {tab === 'scene' ? 'Нет сцен. Создайте сцену из раздела Плейлисты.' : 'Нет контента'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {filtered.map(c => (
                <div key={c.id} onClick={() => { setSelected(c.id); setSelectedType(tab === 'scene' ? 'scene' : c.type); }}
                  style={{ padding: '10px 14px', borderRadius: 'var(--r)', border: `1px solid ${selected === c.id ? 'var(--a1)' : 'var(--border)'}`, background: selected === c.id ? 'var(--accent-soft)' : 'var(--surface2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'border-color 0.1s, background 0.1s' }}>
                  <span className={`tag tag-${tab === 'scene' ? 'scene' : c.type}`}>{tab === 'scene' ? 'Сцена' : TYPE_LABELS[c.type]}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 500, color: 'var(--t1)' }}>{c.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={add} disabled={!selected || loading}>Добавить</button>
        </div>
      </div>
    </div>
  );
}

// ── Timeline row (ruler + track) ──────────────────────────────────────────────
function TimelineRow({ rowStart, rowSec, pxPerSec, rowWidth, items, selected, onSelect, onDragStart, onResizeStart, onClick }) {
  const rs = Math.round(rowSec);
  const step = rs > 120 ? 30 : rs > 60 ? 10 : rs > 30 ? 5 : 2;
  const ticks = [];
  for (let t = 0; t <= rowSec; t += step) ticks.push(rowStart + t);

  return (
    <div style={{ flexShrink: 0, width: rowWidth, overflow: 'hidden' }}>
      {/* Ruler for this row */}
      <div style={{ position: 'relative', height: RULER_HEIGHT, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        {ticks.map(t => {
          const left = (t - rowStart) * pxPerSec;
          return (
            <div key={t} style={{ position: 'absolute', left, top: 0, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <div style={{ width: 1, height: 12, background: 'var(--border2)', marginTop: 'auto' }} />
              <span style={{ fontSize: 10, color: 'var(--t3)', paddingLeft: 3, paddingBottom: 2, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {formatTime(t)}
              </span>
            </div>
          );
        })}
      </div>
      {/* Track for this row */}
      <div style={{ position: 'relative', height: TRACK_HEIGHT, background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}
        onClick={onClick}>
        {items.map(item => {
          const itemStart = item.start_time ?? 0;
          const itemEnd = itemStart + getEffectiveDuration(item);
          const rowEnd = rowStart + rowSec;
          // skip items entirely outside this row
          if (itemEnd <= rowStart || itemStart >= rowEnd) return null;
          const clampedStart = Math.max(itemStart, rowStart);
          const clampedEnd = Math.min(itemEnd, rowEnd);
          const left = (clampedStart - rowStart) * pxPerSec;
          const width = Math.max(4, (clampedEnd - clampedStart) * pxPerSec);
          const isSelected = selected === item.id;
          const isScrollLocked = (item.type === 'webpage' || item.type === 'html') && item.scroll_behavior === 'smooth';
          const color = TYPE_COLORS[item.type] || '#7c5cfc';
          const isCut = itemStart < rowStart || itemEnd > rowEnd;
          return (
            <div key={item.id}
              style={{
                position: 'absolute', left, top: TRACK_PADDING, width,
                height: TRACK_HEIGHT - TRACK_PADDING * 2,
                background: isSelected ? `${color}55` : `${color}33`,
                border: `1.5px solid ${isSelected ? color : color + '88'}`,
                borderRadius: isCut ? (itemStart < rowStart ? '0 6px 6px 0' : '6px 0 0 6px') : 6,
                cursor: 'grab', overflow: 'hidden', userSelect: 'none',
                boxSizing: 'border-box',
                transition: 'background 0.1s, border-color 0.1s',
              }}
              onMouseDown={e => { e.stopPropagation(); onSelect(item.id); onDragStart(e, item); }}
              onClick={e => { e.stopPropagation(); onSelect(item.id); }}
            >
              {/* Left resize — only on first segment, not scroll-locked */}
              {!isScrollLocked && itemStart >= rowStart && (
                <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', cursor: 'w-resize', zIndex: 2 }}
                  onMouseDown={e => { e.stopPropagation(); onResizeStart(e, item, 'left'); }} />
              )}
              <div style={{ padding: '4px 8px 4px 10px', display: 'flex', flexDirection: 'column', gap: 2, pointerEvents: 'none' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ background: `${color}44`, borderRadius: 3, padding: '0 4px', fontSize: 9, letterSpacing: '0.05em' }}>{TYPE_LABELS[item.type]}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: width - 60 }}>{item.name}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--t3)' }}>{formatTime(getEffectiveDuration(item))}</div>
              </div>
              {/* Right resize — only on last segment, not scroll-locked */}
              {!isScrollLocked && itemEnd <= rowEnd && (
                <div style={{ position: 'absolute', right: 0, top: 0, width: 6, height: '100%', cursor: 'e-resize', background: `${color}55`, zIndex: 2 }}
                  onMouseDown={e => { e.stopPropagation(); onResizeStart(e, item, 'right'); }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function scrollSpeedToDuration(speed) {
  return Math.ceil(30 * 850 * (100 / speed) / 1000);
}

function getMinDuration(item) {
  if ((item.type === 'webpage' || item.type === 'html') && item.scroll_behavior === 'smooth')
    return scrollSpeedToDuration(item.scroll_speed ?? 100);
  return MIN_DURATION;
}

// For scroll items: duration IS the scroll duration, can't be overridden
function getEffectiveDuration(item) {
  if ((item.type === 'webpage' || item.type === 'html') && item.scroll_behavior === 'smooth')
    return scrollSpeedToDuration(item.scroll_speed ?? 100);
  return item.duration_override ?? item.duration ?? 10;
}

// Re-pack items so they follow each other without gaps, preserving their current order by start_time.
// fromIndex: first item whose duration changed — only items at or after it get shifted.
function repackFrom(items, fromIndex) {
  const sorted = [...items].sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0));
  let cursor = fromIndex > 0 ? (sorted[fromIndex - 1].start_time ?? 0) + getEffectiveDuration(sorted[fromIndex - 1]) : 0;
  for (let i = fromIndex; i < sorted.length; i++) {
    sorted[i] = { ...sorted[i], start_time: Math.round(cursor * 10) / 10 };
    cursor += getEffectiveDuration(sorted[i]);
  }
  // restore original array order (by id)
  const byId = Object.fromEntries(sorted.map(it => [it.id, it]));
  return items.map(it => byId[it.id] ?? it);
}

// ── Main PlaylistEditor ───────────────────────────────────────────────────────
export default function PlaylistEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  const [playlist, setPlaylist] = useState(null);
  const [items, setItems] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [denied, setDenied] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  const timelineRef = useRef(null);
  const dragState = useRef(null);
  const saveTimer = useRef(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const containerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getPlaylist(id);
      setPlaylist(data);
      const packed = repackFrom(data.items, 0);
      setItems(packed);
      const changed = packed.some((it, i) => it.start_time !== data.items[i].start_time);
      if (changed) {
        await api.reorderItems(id, packed.map((it, i) => ({ id: it.id, position: i, start_time: it.start_time ?? 0 })));
      }
    } catch (e) {
      if (e instanceof PermissionError) setDenied(true);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const loadVersions = useCallback(async () => {
    setVersionsLoading(true);
    try {
      const data = await api.getPlaylistVersions(id);
      setVersions(data);
    } catch { /* ignore */ }
    finally { setVersionsLoading(false); }
  }, [id]);

  const saveVersion = useCallback(async () => {
    const label = window.prompt('Название версии (необязательно):');
    if (label === null) return;
    try {
      await api.createPlaylistVersion(id, { label: label.trim() || undefined });
      await loadVersions();
    } catch (e) { alert('Ошибка: ' + e.message); }
  }, [id, loadVersions]);

  const restoreVersion = useCallback(async (vid) => {
    if (!window.confirm('Восстановить эту версию? Текущее состояние будет заменено.')) return;
    try {
      await api.restorePlaylistVersion(id, vid);
      await load();
      await loadVersions();
    } catch (e) { alert('Ошибка: ' + e.message); }
  }, [id, load, loadVersions]);

  const deleteVersion = useCallback(async (vid) => {
    if (!window.confirm('Удалить эту версию?')) return;
    try {
      await api.deletePlaylistVersion(id, vid);
      setVersions(v => v.filter(x => x.id !== vid));
    } catch (e) { alert('Ошибка: ' + e.message); }
  }, [id]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.getBoundingClientRect().width;
    if (w > 0) setContainerWidth(w);
    const ro = new ResizeObserver(entries => {
      const cw = entries[0].contentRect.width;
      if (cw > 0) setContainerWidth(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length]);

  const saveItems = useCallback(async (newItems) => {
    setSaving(true);
    try {
      await api.reorderItems(id, newItems.map((it, i) => ({
        id: it.id,
        position: i,
        start_time: it.start_time ?? 0,
      })));
      for (const it of newItems) {
        if (it._durChanged) {
          await api.updateItem(id, it.id, { duration_override: it.duration_override });
        }
      }
    } catch (e) {
      if (e instanceof PermissionError) return;
    } finally { setSaving(false); }
  }, [id]);

  // Debounced save for direct input fields (start_time / duration inputs in panel)
  const scheduleSave = useCallback((newItems) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveItems(newItems), 600);
  }, [saveItems]);

  const updateItems = useCallback((fn, immediate = false) => {
    setItems(prev => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      if (immediate) saveItems(next);
      else scheduleSave(next);
      return next;
    });
  }, [scheduleSave, saveItems]);

  // Timeline drag: move item — save only on mouseUp
  const onDragStart = useCallback((e, item) => {
    const pxPerSec = PX_PER_SEC * zoom;
    dragState.current = {
      mode: 'move',
      itemId: item.id,
      startX: e.clientX,
      origStart: item.start_time ?? 0,
    };

    const onMove = (e2) => {
      const ds = dragState.current;
      if (!ds) return;
      const dx = e2.clientX - ds.startX;
      const newStart = Math.max(0, Math.round((ds.origStart + dx / pxPerSec) * 10) / 10);
      ds.lastStart = newStart;
      flushSync(() => {
        setItems(prev => prev.map(it => it.id === ds.itemId ? { ...it, start_time: newStart } : it));
      });
    };
    const onUp = () => {
      const ds = dragState.current;
      const lastStart = ds?.lastStart;
      const itemId = ds?.itemId;
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (lastStart != null) {
        setItems(prev => {
          const next = prev.map(it => it.id === itemId ? { ...it, start_time: lastStart } : it);
          saveItems(next);
          return next;
        });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [zoom, saveItems]);

  // Timeline resize: change duration — save only on mouseUp
  const onResizeStart = useCallback((e, item, side) => {
    const pxPerSec = PX_PER_SEC * zoom;
    const origDur = getEffectiveDuration(item);
    const origStart = item.start_time ?? 0;
    const minDur = getMinDuration(item);
    dragState.current = { mode: 'resize', side, itemId: item.id, startX: e.clientX, origDur, origStart, minDur };

    const onMove = (e2) => {
      const ds = dragState.current;
      if (!ds) return;
      const dx = e2.clientX - ds.startX;
      if (side === 'right') {
        const newDur = Math.max(ds.minDur, Math.round((ds.origDur + dx / pxPerSec) * 10) / 10);
        ds.lastDur = newDur;
        flushSync(() => {
          setItems(prev => {
            const patched = prev.map(it => it.id === ds.itemId ? { ...it, duration_override: newDur, _durChanged: true } : it);
            const sorted = [...patched].sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0));
            const idx = sorted.findIndex(it => it.id === ds.itemId);
            return repackFrom(patched, idx);
          });
        });
      } else {
        const newStart = Math.max(0, Math.round((ds.origStart + dx / pxPerSec) * 10) / 10);
        const newDur = Math.max(ds.minDur, Math.round((ds.origDur - (newStart - ds.origStart)) * 10) / 10);
        ds.lastStart = newStart;
        ds.lastDur = newDur;
        flushSync(() => {
          setItems(prev => prev.map(it => it.id === ds.itemId ? { ...it, start_time: newStart, duration_override: newDur, _durChanged: true } : it));
        });
      }
    };
    const onUp = () => {
      const ds = dragState.current;
      const { lastStart, lastDur, itemId: dsItemId } = ds ?? {};
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (lastStart != null || lastDur != null) {
        setItems(prev => {
          let next = prev.map(it => {
            if (it.id !== dsItemId) return it;
            const patch = { _durChanged: true };
            if (lastStart != null) patch.start_time = lastStart;
            if (lastDur != null) patch.duration_override = lastDur;
            return { ...it, ...patch };
          });
          if (side === 'right') {
            const sorted = [...next].sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0));
            const idx = sorted.findIndex(it => it.id === dsItemId);
            next = repackFrom(next, idx);
          }
          saveItems(next);
          return next;
        });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [zoom, saveItems]);

  async function removeItem(itemId) {
    updateItems(prev => prev.filter(i => i.id !== itemId));
    try { await api.removeItem(id, itemId); } catch { load(); }
  }

  const selectedItem = items.find(i => i.id === selected);
  const totalSec = items.reduce((max, it) => Math.max(max, (it.start_time ?? 0) + getEffectiveDuration(it)), 30);
  const pxPerSec = PX_PER_SEC * zoom;
  // rowSec = how many seconds fit exactly in the container width
  const rowSec = containerWidth > 0 ? containerWidth / pxPerSec : totalSec + 10;
  const numRows = Math.ceil(totalSec / rowSec) + 1;
  const rows = Array.from({ length: numRows }, (_, i) => i).filter(i => {
    const rowStart = i * rowSec;
    const rowEnd = rowStart + rowSec;
    return items.some(it => {
      const s = it.start_time ?? 0;
      const e = s + getEffectiveDuration(it);
      return e > rowStart && s < rowEnd;
    });
  });

  if (denied) return <AccessDenied />;
  if (!playlist) return <div style={{ color: 'var(--t3)', padding: '48px 0', textAlign: 'center' }}>Загрузка...</div>;

  const canEdit = hasPerm('playlists.edit_any') || hasPerm('playlists.edit_own');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {!canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', background: 'rgba(245,158,11,0.1)', borderBottom: '1px solid rgba(245,158,11,0.25)', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 500 }}>Режим просмотра — у вас нет прав на редактирование этого плейлиста</span>
        </div>
      )}
      {/* Header */}
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/playlists')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Назад
          </button>
          <div style={{ width: 1, height: 22, background: 'var(--border2)' }} />
          <h1 style={{ fontSize: 20, margin: 0 }}>{playlist.name}</h1>
          {saving && <span style={{ fontSize: 11, color: 'var(--t3)' }}>Сохранение...</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Zoom controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
            <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t2)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>−</button>
            <span style={{ fontSize: 12, color: 'var(--t2)', minWidth: 36, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t2)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>+</button>
          </div>
          {hasPerm('playlists.versions') && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setVersionsOpen(v => !v); if (!versionsOpen) loadVersions(); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 4 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              История
            </button>
          )}
          {(hasPerm('playlists.edit_any') || hasPerm('playlists.edit_own')) && (
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              Добавить
            </button>
          )}
        </div>
      </div>

      {/* Main area */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Timeline */}
        <div ref={containerRef} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {items.length === 0 ? (
            <div className="empty-state">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              <strong>Плейлист пуст</strong>
              <p>Добавьте контент или сцену</p>
              {(hasPerm('playlists.edit_any') || hasPerm('playlists.edit_own')) && (
                <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => setShowAdd(true)}>Добавить</button>
              )}
            </div>
          ) : (
            <div ref={timelineRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
              {rows.map(i => (
                <TimelineRow
                  key={i}
                  rowStart={i * rowSec}
                  rowSec={rowSec}
                  pxPerSec={pxPerSec}
                  rowWidth={containerWidth}
                  items={items}
                  selected={selected}
                  onSelect={id => setSelected(id)}
                  onDragStart={canEdit ? onDragStart : () => {}}
                  onResizeStart={canEdit ? onResizeStart : () => {}}
                  onClick={() => setSelected(null)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right panel: properties of selected item */}
        <div style={{ width: 240, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
          {selectedItem ? (
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Элемент</div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span className={`tag tag-${selectedItem.type}`}>{TYPE_LABELS[selectedItem.type]}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedItem.name}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Начало (сек)</div>
                  <input type="number" className="form-input" style={{ padding: '6px 10px', fontSize: 13 }} min="0" step="0.1"
                    value={selectedItem.start_time ?? 0}
                    readOnly={!canEdit}
                    onChange={canEdit ? (e => updateItems(prev => prev.map(it => it.id === selected ? { ...it, start_time: Math.max(0, Number(e.target.value)) } : it))) : undefined} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Длительность (сек)</div>
                  {(selectedItem.type === 'webpage' || selectedItem.type === 'html') && selectedItem.scroll_behavior === 'smooth' ? (
                    <div style={{ padding: '6px 10px', fontSize: 13, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      {getEffectiveDuration(selectedItem)} сек
                      <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 'auto' }}>задаётся скоростью</span>
                    </div>
                  ) : (
                    <input type="number" className="form-input" style={{ padding: '6px 10px', fontSize: 13 }} min={MIN_DURATION} step="1"
                      value={selectedItem.duration_override ?? selectedItem.duration ?? 10}
                      readOnly={!canEdit}
                      onChange={canEdit ? (e => updateItems(prev => {
                        const patched = prev.map(it => it.id === selected ? { ...it, duration_override: Math.max(MIN_DURATION, Number(e.target.value)), _durChanged: true } : it);
                        const sorted = [...patched].sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0));
                        const idx = sorted.findIndex(it => it.id === selected);
                        return repackFrom(patched, idx);
                      })) : undefined} />
                  )}
                </div>
              </div>

              {selectedItem.type === 'scene' && (
                <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginBottom: 10, fontSize: 12 }}
                  onClick={() => navigate(`/scenes/${selectedItem.scene_id}`)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Редактировать сцену
                </button>
              )}

              {(hasPerm('playlists.edit_any') || hasPerm('playlists.edit_own')) && (
                <button className="btn btn-danger btn-sm" style={{ width: '100%', fontSize: 12 }} onClick={() => { removeItem(selected); setSelected(null); }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  Удалить
                </button>
              )}
            </div>
          ) : (
            <div style={{ padding: '32px 16px 16px', color: 'var(--t3)', fontSize: 12, textAlign: 'center' }}>
              Выберите элемент<br />на шкале времени
            </div>
          )}

          {/* Item list */}
          {items.length > 0 && (
            <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--border)', padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Список ({items.length})
              </div>
              {[...items].sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0)).map(it => (
                <div key={it.id}
                  onClick={() => setSelected(it.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6, marginBottom: 2, cursor: 'pointer', background: selected === it.id ? 'var(--accent-soft)' : 'transparent', border: `1px solid ${selected === it.id ? 'var(--a1)' : 'transparent'}` }}>
                  <span className={`tag tag-${it.type}`} style={{ fontSize: 9 }}>{TYPE_LABELS[it.type]}</span>
                  <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t1)' }}>{it.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--t3)', flexShrink: 0 }}>{formatTime(it.start_time ?? 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {versionsOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setVersionsOpen(false)} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 320,
            background: 'var(--surface2)', borderLeft: '1px solid var(--border)',
            zIndex: 50, display: 'flex', flexDirection: 'column',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>История версий</div>
              <button onClick={() => setVersionsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 4 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={saveVersion}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginRight: 5 }}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Сохранить версию
              </button>
              <div style={{ fontSize: 10, color: 'var(--t3)', textAlign: 'center', marginTop: 6 }}>Макс. 5 версий · старые удаляются автоматически</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
              {versionsLoading ? (
                <div style={{ color: 'var(--t3)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>Загрузка...</div>
              ) : versions.length === 0 ? (
                <div style={{ color: 'var(--t3)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>Нет сохранённых версий</div>
              ) : versions.map((v, i) => (
                <div key={v.id} style={{ padding: '10px 12px', marginBottom: 8, background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--a2)' }}>v{v.version_num}</span>
                    {i === 0 && <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--green)', background: 'rgba(34,211,160,0.12)', padding: '1px 5px', borderRadius: 3 }}>последняя</span>}
                  </div>
                  {v.label && <div style={{ fontSize: 11, color: 'var(--t1)', marginBottom: 3 }}>{v.label}</div>}
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 8 }}>
                    {new Date(v.created_at * 1000).toLocaleString('ru')}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1, fontSize: 11 }} onClick={() => restoreVersion(v.id)}>
                      Восстановить
                    </button>
                    <button onClick={() => deleteVersion(v.id)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r)', cursor: 'pointer', color: 'var(--red)', padding: '4px 8px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {showAdd && (
        <AddItemModal
          playlistId={id}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}
    </div>
  );
}
