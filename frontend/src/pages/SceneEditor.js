import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.js`;
import { flushSync } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { api, PermissionError } from '../api';
import { useAuth } from '../AuthContext';
import AccessDenied from '../components/AccessDenied';
import { WIDGET_TYPES, WIDGET_DEFAULTS, buildWidgetUrl } from '../widgets';

// ── Constants ─────────────────────────────────────────────────────────────────
const MIN_SIZE = 80;
const GRID = 10;

const PRESETS = [
  { label: '1920×1080 (16:9 Full HD)', w: 1920, h: 1080 },
  { label: '3840×2160 (4K UHD)',        w: 3840, h: 2160 },
  { label: '1280×720 (16:9 HD)',         w: 1280, h: 720  },
  { label: '1080×1920 (9:16 Portrait)',  w: 1080, h: 1920 },
  { label: '1080×1080 (1:1 Square)',     w: 1080, h: 1080 },
  { label: '2560×1440 (QHD)',            w: 2560, h: 1440 },
];

const TYPE_LABELS = {
  image: 'Фото',
  video: 'Видео',
  webpage: 'Веб',
  html: 'HTML',
  pdf: 'PDF',
  text: 'Текст',
  widget: 'Виджет',
};
const TYPE_COLORS = {
  image: '#7c5cfc',
  video: '#e05c8a',
  webpage: '#2eaadc',
  html: '#f59e0b',
  pdf: '#ef4444',
  text: '#10b981',
  widget: '#6366f1',
};

// Timeline constants
const TL_PX_PER_SEC = 20;
const TL_ROW_H = 36;
const TL_RULER_H = 24;
const TL_MIN_DUR = 0.5;
const TL_LABEL_W = 120;

function snap(v) { return Math.round(v / GRID) * GRID; }

function scrollSpeedToDuration(speed) {
  return Math.ceil(30 * 850 * (100 / speed) / 1000);
}

function isScrollLocked(obj) {
  return (obj.type === 'webpage' || obj.type === 'html') &&
    (obj.props?.scroll_behavior ?? obj.scroll_behavior) === 'smooth';
}

function getObjDuration(obj) {
  if (isScrollLocked(obj)) return scrollSpeedToDuration(obj.props?.scroll_speed ?? obj.scroll_speed ?? 100);
  return obj.obj_duration ?? 10;
}

// ── DragHandle icon ───────────────────────────────────────────────────────────
function DragHandle() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="none" style={{ flexShrink: 0, opacity: 0.35 }}>
      <circle cx="3" cy="2.5" r="1.2" fill="currentColor"/>
      <circle cx="7" cy="2.5" r="1.2" fill="currentColor"/>
      <circle cx="3" cy="7"   r="1.2" fill="currentColor"/>
      <circle cx="7" cy="7"   r="1.2" fill="currentColor"/>
      <circle cx="3" cy="11.5" r="1.2" fill="currentColor"/>
      <circle cx="7" cy="11.5" r="1.2" fill="currentColor"/>
    </svg>
  );
}

// ── X icon ────────────────────────────────────────────────────────────────────
function X() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12"/>
    </svg>
  );
}

// ── Folder icon ───────────────────────────────────────────────────────────────
function FolderIcon({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
      {open
        ? <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        : <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      }
    </svg>
  );
}

// ── ChevronRight icon ─────────────────────────────────────────────────────────
function ChevronIcon({ down }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ transition: 'transform 0.15s', transform: down ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>
      <path d="M9 18l6-6-6-6"/>
    </svg>
  );
}

// ── HTML preview with blob URL lifecycle management ───────────────────────────
function PdfPreview({ url, scale }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    const render = () => {
      pdfjsLib.getDocument(url).promise.then(pdf => {
        if (cancelled) return;
        pdf.getPage(1).then(page => {
          if (cancelled) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          const cw = container.clientWidth || 200;
          const ch = container.clientHeight || 200;
          const vp = page.getViewport({ scale: 1 });
          const s = Math.min(cw / vp.width, ch / vp.height);
          const scaled = page.getViewport({ scale: s });
          canvas.width = scaled.width;
          canvas.height = scaled.height;
          page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled });
        });
      }).catch(() => {});
    };

    // Ждём пока контейнер получит размеры
    if (container.clientWidth > 0) {
      render();
    } else {
      const ro = new ResizeObserver(() => { if (container.clientWidth > 0) { ro.disconnect(); render(); } });
      ro.observe(container);
      return () => { cancelled = true; ro.disconnect(); };
    }

    return () => { cancelled = true; };
  }, [url, scale]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

function HtmlPreview({ html, scale, name, allowNetwork }) {
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [html]);

  if (!blobUrl) return null;
  // allow-same-origin is needed for widgets to fetch /api/* endpoints
  const sandbox = allowNetwork ? 'allow-scripts allow-same-origin' : 'allow-scripts';
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <iframe
        src={blobUrl}
        style={{ width: `${100 / scale}%`, height: `${100 / scale}%`, border: 'none', transformOrigin: '0 0', transform: `scale(${scale})` }}
        title={name}
        sandbox={sandbox}
      />
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }} />
    </div>
  );
}

// ── Object preview ────────────────────────────────────────────────────────────
function ObjectPreview({ obj, scale, editing, onTextCommit }) {
  const url = obj.url ? `/api/proxy?url=${encodeURIComponent(obj.url)}` : null;
  const textRef = useRef(null);

  useEffect(() => {
    if (editing && textRef.current) {
      textRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(textRef.current);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [editing]);

  if (obj.type === 'text') {
    const p = obj.props || {};
    const fs = (p.fontSize || 48) * scale;
    const style = {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: p.valign === 'top' ? 'flex-start' : p.valign === 'bottom' ? 'flex-end' : 'center',
      justifyContent: p.align === 'left' ? 'flex-start' : p.align === 'right' ? 'flex-end' : 'center',
      backgroundColor: p.bgColor ? hexToRgba(p.bgColor, (p.bgOpacity ?? 0) / 100) : 'transparent',
      padding: 4,
      overflow: 'hidden',
    };
    const textStyle = {
      fontSize: fs,
      fontFamily: p.fontFamily || 'Inter',
      color: p.color || '#ffffff',
      fontWeight: p.bold ? 700 : 400,
      fontStyle: p.italic ? 'italic' : 'normal',
      lineHeight: p.lineHeight || 1.2,
      textAlign: p.align || 'center',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      outline: 'none',
      pointerEvents: editing ? 'auto' : 'none',
    };

    if (editing) {
      return (
        <div style={style}>
          <div
            ref={textRef}
            contentEditable
            suppressContentEditableWarning
            style={textStyle}
            onBlur={e => onTextCommit && onTextCommit(e.currentTarget.innerText)}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); }
            }}
          >
            {p.text || ''}
          </div>
        </div>
      );
    }

    return (
      <div style={style}>
        <div style={textStyle}>{p.text || 'Текст'}</div>
      </div>
    );
  }

  if (obj.type === 'image' && obj.url) {
    const src = obj.url.startsWith('/uploads/') ? obj.url : url;
    return <img src={src} alt={obj.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />;
  }
  if (obj.type === 'video' && obj.url) {
    const src = obj.url.startsWith('/uploads/') ? obj.url : url;
    return <video src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} muted />;
  }
  if (obj.type === 'webpage' && obj.url) {
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <iframe
          src={`/api/proxy?url=${encodeURIComponent(obj.url)}`}
          style={{ width: `${100 / scale}%`, height: `${100 / scale}%`, border: 'none', transformOrigin: '0 0', transform: `scale(${scale})` }}
          title={obj.name}
          sandbox="allow-scripts allow-forms allow-popups"
        />
        <div style={{ position: 'absolute', inset: 0, zIndex: 1 }} />
      </div>
    );
  }
  if (obj.type === 'widget' && obj.props?.widgetType) {
    const widgetSrc = buildWidgetUrl(obj.props.widgetType, obj.props);
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <iframe
          src={widgetSrc}
          style={{ width: `${100 / scale}%`, height: `${100 / scale}%`, border: 'none', transformOrigin: '0 0', transform: `scale(${scale})` }}
          title={obj.name}
        />
        <div style={{ position: 'absolute', inset: 0, zIndex: 1 }} />
      </div>
    );
  }
  if (obj.type === 'html' && obj.html) {
    return <HtmlPreview html={obj.html} scale={scale} name={obj.name} />;
  }
  if (obj.type === 'pdf' && obj.url) {
    return <PdfPreview url={obj.url} scale={scale} />;
  }

  const color = TYPE_COLORS[obj.type] || '#7c5cfc';
  return (
    <div style={{ width: '100%', height: '100%', background: `${color}22`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <span style={{ fontSize: Math.max(10, Math.min(24, obj.w * scale / 8)), color, fontWeight: 700, opacity: 0.8 }}>
        {TYPE_LABELS[obj.type] || '?'}
      </span>
      <span style={{ fontSize: Math.max(8, Math.min(12, obj.w * scale / 16)), color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90%' }}>
        {obj.name}
      </span>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function hexToRgba(hex, alpha) {
  if (!hex) return 'transparent';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getTypeFromUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    if (/\.(png|jpg|jpeg|gif|webp|svg)$/.test(path)) return 'image';
    if (/\.(mp4|webm|mov)$/.test(path)) return 'video';
    if (/\.pdf$/.test(path)) return 'pdf';
    return 'webpage';
  } catch {
    return 'webpage';
  }
}

function getNameFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || u.hostname || url;
  } catch {
    return url;
  }
}

// ── ContentPickerModal ────────────────────────────────────────────────────────
function ContentPickerModal({ onClose, onPick }) {
  const [content, setContent] = useState([]);
  const [filter, setFilter] = useState('');
  const mouseDownTarget = useRef(null);

  useEffect(() => { api.getContent().then(setContent); }, []);

  const filtered = content.filter(c =>
    c.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="modal-backdrop"
      onMouseDown={e => { mouseDownTarget.current = e.target; }}
      onMouseUp={e => { if (mouseDownTarget.current === e.currentTarget && e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2>Выбрать контент</h2>
          <button className="modal-close" onClick={onClose}><X /></button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
          <input
            className="form-input"
            placeholder="Поиск..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ marginBottom: 12 }}
            autoFocus
          />
          {filtered.length === 0 ? (
            <div style={{ color: 'var(--t3)', textAlign: 'center', padding: '32px 0', fontSize: 13 }}>Ничего не найдено</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {filtered.map(c => (
                <div key={c.id} onClick={() => onPick(c)}
                  style={{ padding: '10px 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--surface2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'border-color 0.1s, background 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--a1)'; e.currentTarget.style.background = 'var(--accent-soft)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface2)'; }}>
                  <span className={`tag tag-${c.type}`}>{TYPE_LABELS[c.type] || c.type}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 500, color: 'var(--t1)' }}>{c.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

// ── AddByUrlModal ─────────────────────────────────────────────────────────────
function AddByUrlModal({ onClose, onAdd }) {
  const [url, setUrl] = useState('');
  const mouseDownTarget = useRef(null);

  const handleAdd = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const type = getTypeFromUrl(trimmed);
    const name = getNameFromUrl(trimmed);
    onAdd({ url: trimmed, type, name });
    onClose();
  };

  return (
    <div className="modal-backdrop"
      onMouseDown={e => { mouseDownTarget.current = e.target; }}
      onMouseUp={e => { if (mouseDownTarget.current === e.currentTarget && e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 480 }}>
        <div className="modal-header">
          <h2>Добавить по URL</h2>
          <button className="modal-close" onClick={onClose}><X /></button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--t2)' }}>URL контента</div>
          <input
            className="form-input"
            placeholder="https://example.com/video.mp4"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') onClose(); }}
            autoFocus
            style={{ marginBottom: 8 }}
          />
          <div style={{ fontSize: 11, color: 'var(--t3)' }}>
            Тип определяется автоматически: .png/.jpg/.gif/.webp/.svg → изображение, .mp4/.webm/.mov → видео, .pdf → PDF, иначе → веб-страница
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={!url.trim()}>Добавить</button>
        </div>
      </div>
    </div>
  );
}

// ── TextPropsPanel ────────────────────────────────────────────────────────────
function TextPropsPanel({ obj, onChange }) {
  const p = obj.props || {};

  const set = (key, value) => {
    onChange({ ...obj, props: { ...p, [key]: value } });
  };

  const FONTS = ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Verdana'];

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Текст</div>

      {/* Text content */}
      <textarea
        className="form-input"
        value={p.text || ''}
        onChange={e => set('text', e.target.value)}
        rows={3}
        style={{ width: '100%', resize: 'vertical', fontSize: 12, marginBottom: 10 }}
        placeholder="Введите текст..."
      />

      {/* Font family */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Шрифт</div>
        <select
          className="form-input"
          value={p.fontFamily || 'Inter'}
          onChange={e => set('fontFamily', e.target.value)}
          style={{ width: '100%', padding: '5px 8px', fontSize: 12 }}>
          {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      {/* Font size + color */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Размер</div>
          <input
            type="number" min={8} max={200}
            className="form-input"
            value={p.fontSize || 48}
            onChange={e => set('fontSize', Math.max(8, Math.min(200, Number(e.target.value))))}
            style={{ width: '100%', padding: '5px 8px', fontSize: 12 }}
          />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Цвет</div>
          <input
            type="color"
            value={p.color || '#ffffff'}
            onChange={e => set('color', e.target.value)}
            style={{ width: '100%', height: 32, border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--surface2)', cursor: 'pointer', padding: 2 }}
          />
        </div>
      </div>

      {/* Align */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Выравнивание</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['left', 'Лево'], ['center', 'Центр'], ['right', 'Право']].map(([val, label]) => (
            <button key={val}
              className={`btn btn-sm ${(p.align || 'center') === val ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1, fontSize: 10 }}
              onClick={() => set('align', val)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Bold / Italic */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button
          className={`btn btn-sm ${p.bold ? 'btn-primary' : 'btn-ghost'}`}
          style={{ flex: 1, fontSize: 12, fontWeight: 700 }}
          onClick={() => set('bold', !p.bold)}>
          B
        </button>
        <button
          className={`btn btn-sm ${p.italic ? 'btn-primary' : 'btn-ghost'}`}
          style={{ flex: 1, fontSize: 12, fontStyle: 'italic' }}
          onClick={() => set('italic', !p.italic)}>
          I
        </button>
      </div>

      {/* Background color + opacity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Фон</div>
          <input
            type="color"
            value={p.bgColor || '#000000'}
            onChange={e => set('bgColor', e.target.value)}
            style={{ width: '100%', height: 32, border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--surface2)', cursor: 'pointer', padding: 2 }}
          />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Прозрачность фона: {p.bgOpacity ?? 0}%</div>
          <input
            type="range" min={0} max={100}
            value={p.bgOpacity ?? 0}
            onChange={e => set('bgOpacity', Number(e.target.value))}
            style={{ width: '100%', marginTop: 6 }}
          />
        </div>
      </div>
    </div>
  );
}

// ── WidgetPickerModal ─────────────────────────────────────────────────────────
function WidgetPickerModal({ onClose, onPick }) {
  const mouseDownTarget = useRef(null);

  return (
    <div className="modal-backdrop"
      onMouseDown={e => { mouseDownTarget.current = e.target; }}
      onMouseUp={e => { if (mouseDownTarget.current === e.currentTarget && e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 580, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2>Добавить виджет</h2>
          <button className="modal-close" onClick={onClose}><X /></button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {WIDGET_TYPES.map(w => (
              <div key={w.key} onClick={() => onPick(w.key)}
                style={{ padding: '14px 16px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--surface2)', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12, transition: 'border-color 0.1s, background 0.1s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = w.color; e.currentTarget.style.background = w.color + '18'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface2)'; }}>
                <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{w.icon}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 3 }}>{w.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.4 }}>{w.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

// ── WidgetPropsPanel ──────────────────────────────────────────────────────────
function WidgetPropsPanel({ obj, onChange }) {
  const p = obj.props || {};
  const wType = p.widgetType || 'clock';
  const wDef = WIDGET_DEFAULTS[wType] || {};

  const set = (key, value) => {
    onChange({ ...obj, props: { ...p, [key]: value } });
  };

  const rebuild = (overrides) => {
    onChange({ ...obj, props: { ...p, ...overrides } });
  };

  const fieldStyle = { width: '100%', padding: '5px 8px', fontSize: 12 };

  const renderField = (label, key, type = 'text', extra = {}) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>{label}</div>
      <input
        type={type}
        className="form-input"
        style={fieldStyle}
        value={p[key] ?? wDef[key] ?? ''}
        onChange={e => set(key, type === 'number' ? Number(e.target.value) : e.target.value)}
        {...extra}
      />
    </div>
  );

  const renderToggle = (label, key) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--t2)' }}>{label}</span>
      <button
        className={`btn btn-sm ${(p[key] ?? wDef[key] ?? true) ? 'btn-primary' : 'btn-ghost'}`}
        style={{ fontSize: 11, minWidth: 52 }}
        onClick={() => set(key, !(p[key] ?? wDef[key] ?? true))}>
        {(p[key] ?? wDef[key] ?? true) ? 'Вкл' : 'Выкл'}
      </button>
    </div>
  );

  const widgetInfo = WIDGET_TYPES.find(w => w.key === wType);

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>{widgetInfo?.icon}</span>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {widgetInfo?.label || 'Виджет'}
        </div>
      </div>

      {/* Common: font size + color */}
      {wType !== 'qr' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Размер шрифта</div>
            <input type="number" min={8} max={200} className="form-input" style={fieldStyle}
              value={p.fontSize ?? wDef.fontSize ?? 48}
              onChange={e => set('fontSize', Math.max(8, Number(e.target.value)))} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Цвет текста</div>
            <input type="color" value={p.color ?? wDef.color ?? '#ffffff'}
              onChange={e => set('color', e.target.value)}
              style={{ width: '100%', height: 32, border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--surface2)', cursor: 'pointer', padding: 2 }} />
          </div>
        </div>
      )}

      {/* Weather */}
      {wType === 'weather' && (<>
        {renderField('API ключ (OpenWeatherMap)', 'apikey', 'password')}
        {renderField('Город (рус. или англ.)', 'city')}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Единицы</div>
          <select className="form-input" style={fieldStyle}
            value={p.units ?? 'metric'}
            onChange={e => set('units', e.target.value)}>
            <option value="metric">Цельсий (°C)</option>
            <option value="imperial">Фаренгейт (°F)</option>
          </select>
        </div>
        {renderToggle('Иконка погоды', 'showIcon')}
        {renderToggle('Влажность', 'showHumidity')}
        {renderToggle('Ветер', 'showWind')}
        {renderField('Обновление (сек)', 'refreshInterval', 'number', { min: 60 })}
        <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4, padding: '6px 8px', background: 'var(--surface2)', borderRadius: 6, lineHeight: 1.5 }}>
          Ключ: <a href="https://openweathermap.org/api" target="_blank" rel="noreferrer" style={{ color: 'var(--a1)' }}>openweathermap.org/api</a>
          {' (новый ключ активируется до 2 часов)'}
        </div>
      </>)}

      {/* Clock */}
      {wType === 'clock' && (<>
        {renderToggle('24-часовой формат', 'format24')}
        {renderToggle('Показывать секунды', 'showSeconds')}
        {renderToggle('Показывать дату', 'showDate')}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Часовой пояс</div>
          <select className="form-input" style={fieldStyle}
            value={p.timeZone ?? 'Europe/Moscow'}
            onChange={e => set('timeZone', e.target.value)}>
            {['Europe/Moscow','Europe/Kaliningrad','Asia/Yekaterinburg','Asia/Omsk','Asia/Krasnoyarsk',
              'Asia/Irkutsk','Asia/Yakutsk','Asia/Vladivostok','Asia/Magadan','Asia/Kamchatka',
              'Europe/London','Europe/Berlin','America/New_York','America/Los_Angeles','Asia/Tokyo','Asia/Dubai'].map(tz => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Шрифт</div>
          <select className="form-input" style={fieldStyle}
            value={p.fontFamily ?? 'Inter'}
            onChange={e => set('fontFamily', e.target.value)}>
            {['Inter','Arial','Georgia','Times New Roman','Courier New','Impact','Verdana'].map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
      </>)}

      {/* Currency */}
      {wType === 'currency' && (<>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Валюты (через запятую)</div>
          <input className="form-input" style={fieldStyle}
            value={p.currencies ?? 'USD,EUR,CNY'}
            onChange={e => set('currencies', e.target.value)}
            placeholder="USD,EUR,CNY,GBP" />
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>Доступно: USD EUR GBP CNY JPY CHF TRY KZT</div>
        </div>
        {renderToggle('Флаги валют', 'showFlag')}
        {renderField('Обновление (сек)', 'refreshInterval', 'number', { min: 60 })}
      </>)}

      {/* Countdown */}
      {wType === 'countdown' && (<>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Целевая дата и время</div>
          <input type="datetime-local" className="form-input" style={fieldStyle}
            value={p.targetDate ?? ''}
            onChange={e => set('targetDate', e.target.value)} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Часовой пояс</div>
          <select className="form-input" style={fieldStyle}
            value={p.timeZone ?? 'Europe/Moscow'}
            onChange={e => set('timeZone', e.target.value)}>
            <option value="Europe/Moscow">Москва (UTC+3)</option>
            <option value="Europe/Kaliningrad">Калининград (UTC+2)</option>
            <option value="Europe/Samara">Самара (UTC+4)</option>
            <option value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</option>
            <option value="Asia/Omsk">Омск (UTC+6)</option>
            <option value="Asia/Krasnoyarsk">Красноярск (UTC+7)</option>
            <option value="Asia/Irkutsk">Иркутск (UTC+8)</option>
            <option value="Asia/Yakutsk">Якутск (UTC+9)</option>
            <option value="Asia/Vladivostok">Владивосток (UTC+10)</option>
            <option value="Asia/Magadan">Магадан (UTC+11)</option>
            <option value="Asia/Kamchatka">Камчатка (UTC+12)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
        {renderField('Надпись', 'targetLabel')}
        {renderToggle('Дни', 'showDays')}
        {renderToggle('Часы', 'showHours')}
        {renderToggle('Минуты', 'showMinutes')}
        {renderToggle('Секунды', 'showSeconds')}
      </>)}

      {/* QR */}
      {wType === 'qr' && (<>
        {renderField('Текст или URL', 'content')}
        {renderField('Размер (px)', 'size', 'number', { min: 64, max: 1024 })}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Цвет QR</div>
            <input type="color" value={p.fgColor ?? '#000000'}
              onChange={e => set('fgColor', e.target.value)}
              style={{ width: '100%', height: 32, border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--surface2)', cursor: 'pointer', padding: 2 }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Фон QR</div>
            <input type="color" value={p.bgColor ?? '#ffffff'}
              onChange={e => set('bgColor', e.target.value)}
              style={{ width: '100%', height: 32, border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--surface2)', cursor: 'pointer', padding: 2 }} />
          </div>
        </div>
        {renderField('Поля (px)', 'margin', 'number', { min: 0, max: 20 })}
      </>)}

      {/* RSS */}
      {wType === 'rss' && (<>
        {renderField('URL RSS-ленты', 'feedUrl')}
        {renderField('Макс. записей', 'maxItems', 'number', { min: 1, max: 20 })}
        {renderToggle('Показывать дату', 'showDate')}
        {renderField('Скорость прокрутки', 'scrollSpeed', 'number', { min: 1, max: 500 })}
        {renderField('Обновление (сек)', 'refreshInterval', 'number', { min: 60 })}
        <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4, padding: '6px 8px', background: 'var(--surface2)', borderRadius: 6, lineHeight: 1.5 }}>
          RSS-лента проксируется через /api/proxy. Убедитесь, что источник доступен с сервера.
        </div>
      </>)}

      {/* Text Ticker */}
      {wType === 'text_ticker' && (<>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Текст строки</div>
          <textarea className="form-input" rows={3} style={{ ...fieldStyle, resize: 'vertical' }}
            value={p.text ?? ''}
            onChange={e => set('text', e.target.value)} />
        </div>
        {renderField('Скорость (1–200)', 'speed', 'number', { min: 1, max: 200 })}
      </>)}

      <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 4, fontSize: 11 }}
        onClick={() => rebuild(WIDGET_DEFAULTS[wType] || {})}>
        Сбросить настройки
      </button>
    </div>
  );
}

// ── LayersPanel ───────────────────────────────────────────────────────────────
function LayersPanel({ objects, selectedIds, groups, onSelect, onRemove, onReorder, onGroupCollapse, onGroupRename, onAddToSelection }) {
  const containerRef = useRef(null);
  const itemRefs = useRef({});
  // dnd state stored fully in ref to avoid stale closures, mirrored to state for render
  const dndLive = useRef(null); // { draggingIdx, insertBefore: number|null, startY, currentY }
  const [dndRender, setDndRender] = useState(null); // same shape, drives render

  // Build flat layer list: groups + ungrouped objects (reversed for display, top layer first)
  const groupedObjectIds = new Set(groups.flatMap(g => g.objectIds));
  const ungrouped = objects.filter(o => !groupedObjectIds.has(o.id) && o.type !== 'group');
  const nonGroupPseudo = objects.filter(o => o.type !== 'group');

  // We display: groups first (by their z=-1 pseudo) then ungrouped, reversed by z
  // For simplicity: display groups at top, then ungrouped objects sorted by z desc
  const sortedUngrouped = [...ungrouped].sort((a, b) => b.z - a.z);

  // Build display items array
  const displayItems = [];
  // Add groups
  groups.forEach(g => {
    displayItems.push({ kind: 'group', group: g });
    if (!g.collapsed) {
      // Add group members sorted by z desc
      const members = g.objectIds
        .map(id => objects.find(o => o.id === id))
        .filter(Boolean)
        .sort((a, b) => b.z - a.z);
      members.forEach(obj => {
        displayItems.push({ kind: 'member', obj, groupId: g.id });
      });
    }
  });
  // Add ungrouped objects
  sortedUngrouped.forEach(obj => {
    displayItems.push({ kind: 'object', obj });
  });

  const getItemId = (item) => item.kind === 'group' ? item.group.id : item.obj.id;

  // Compute insertBefore index from mouse Y
  const getInsertBefore = useCallback((mouseY) => {
    for (let i = 0; i < displayItems.length; i++) {
      const id = getItemId(displayItems[i]);
      const el = itemRefs.current[id];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (mouseY < rect.top + rect.height / 2) return i;
    }
    return displayItems.length;
  }, [displayItems]);

  const onHandleMouseDown = useCallback((e, idx) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    let activated = false;

    const activate = (mouseY) => {
      activated = true;
      document.body.style.cursor = 'grabbing';
      const ib = getInsertBefore(mouseY);
      dndLive.current = { draggingIdx: idx, insertBefore: ib, currentY: mouseY };
      setDndRender({ ...dndLive.current });
    };

    const onMove = (e2) => {
      if (!activated && Math.abs(e2.clientY - startY) > 4) activate(e2.clientY);
      if (!activated) return;
      const ib = getInsertBefore(e2.clientY);
      dndLive.current = { draggingIdx: idx, insertBefore: ib, currentY: e2.clientY };
      setDndRender({ ...dndLive.current });
    };

    const onUp = (e2) => {
      document.body.style.cursor = '';
      if (activated && dndLive.current) {
        const { draggingIdx, insertBefore } = dndLive.current;
        const adjustedInsert = insertBefore > draggingIdx ? insertBefore - 1 : insertBefore;
        if (adjustedInsert !== draggingIdx) {
          onReorder(draggingIdx, adjustedInsert, displayItems);
        }
      }
      dndLive.current = null;
      setDndRender(null);
      activated = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [displayItems, getInsertBefore, onReorder]);

  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupName, setEditingGroupName] = useState('');

  // Reorder display: if dragging, move item to insertBefore position for live preview
  const orderedItems = useMemo(() => {
    if (!dndRender) return displayItems;
    const { draggingIdx, insertBefore } = dndRender;
    const result = [...displayItems];
    const [moved] = result.splice(draggingIdx, 1);
    const target = insertBefore > draggingIdx ? insertBefore - 1 : insertBefore;
    result.splice(Math.max(0, Math.min(result.length, target)), 0, moved);
    return result;
  }, [displayItems, dndRender]);

  return (
    <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Слои ({nonGroupPseudo.length})
      </div>
      {nonGroupPseudo.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', padding: '24px 0' }}>
          Нет объектов.<br />Нажмите «Добавить объект»
        </div>
      )}

      {orderedItems.map((item, visIdx) => {
        const origIdx = displayItems.indexOf(item);
        const itemId = getItemId(item);
        const isDragging = dndRender && dndRender.draggingIdx === origIdx;

        const renderRow = (content, isSel, indent = false) => (
          <div
            key={itemId}
            ref={el => { itemRefs.current[itemId] = el; }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: indent ? '6px 10px 6px 26px' : '7px 10px',
              borderRadius: 'var(--r)', marginBottom: 2,
              background: isSel ? 'var(--accent-soft)' : 'transparent',
              border: `1px solid ${isSel ? 'var(--a1)' : 'transparent'}`,
              opacity: isDragging ? 0.35 : 1,
              userSelect: 'none',
              transition: 'opacity 0.1s, transform 0.12s',
              transform: isDragging ? 'scale(0.98)' : 'scale(1)',
            }}>
            {content}
          </div>
        );

        if (item.kind === 'group') {
          const g = item.group;
          const isGroupSelected = g.objectIds.length > 0 && g.objectIds.every(id => selectedIds.has(id));
          return (
            <div key={g.id}
              onClick={e => {
                if (e.shiftKey) g.objectIds.forEach(id => onAddToSelection(id));
                else onSelect(g.objectIds, false);
              }}>
              {renderRow(<>
                <span
                  onMouseDown={e => onHandleMouseDown(e, origIdx)}
                  style={{ cursor: 'grab', display: 'flex', color: 'var(--t3)' }}>
                  <DragHandle />
                </span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t2)', padding: 0, display: 'flex' }}
                  onClick={e => { e.stopPropagation(); onGroupCollapse(g.id); }}>
                  <ChevronIcon down={!g.collapsed} />
                </button>
                <FolderIcon open={!g.collapsed} />
                {editingGroupId === g.id ? (
                  <input autoFocus value={editingGroupName}
                    onChange={e => setEditingGroupName(e.target.value)}
                    onBlur={() => { onGroupRename(g.id, editingGroupName); setEditingGroupId(null); }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { onGroupRename(g.id, editingGroupName); setEditingGroupId(null); } }}
                    onClick={e => e.stopPropagation()}
                    style={{ flex: 1, background: 'var(--surface3)', border: '1px solid var(--a1)', borderRadius: 4, color: 'var(--t1)', fontSize: 12, padding: '1px 4px', outline: 'none' }} />
                ) : (
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t1)' }}
                    onDoubleClick={e => { e.stopPropagation(); setEditingGroupId(g.id); setEditingGroupName(g.name); }}>
                    {g.name}
                  </span>
                )}
                <span style={{ fontSize: 10, color: 'var(--t3)' }}>{g.objectIds.length}</span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 2, display: 'flex' }}
                  onClick={e => { e.stopPropagation(); onRemove(null, g.id); }}><X /></button>
              </>, isGroupSelected)}
            </div>
          );
        }

        const obj = item.obj;
        const isSel = selectedIds.has(obj.id);
        const indent = item.kind === 'member';
        return (
          <div key={obj.id}
            onClick={e => {
              if (e.shiftKey) onAddToSelection(obj.id);
              else onSelect([obj.id], false);
            }}>
            {renderRow(<>
              <span
                onMouseDown={e => onHandleMouseDown(e, origIdx)}
                style={{ cursor: 'grab', display: 'flex', color: 'var(--t3)' }}>
                <DragHandle />
              </span>
              <span className={`tag tag-${obj.type}`} style={{ fontSize: 9, padding: '1px 5px' }}>{TYPE_LABELS[obj.type] || '?'}</span>
              <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t1)' }}>{obj.name}</span>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 2, display: 'flex' }}
                onClick={e => { e.stopPropagation(); onRemove(obj.id, null); }}><X /></button>
            </>, isSel, indent)}
          </div>
        );
      })}
    </div>
  );
}

// ── HotkeysHint ───────────────────────────────────────────────────────────────
const HOTKEYS = [
  { keys: ['Ctrl', 'C'],        desc: 'Копировать объект' },
  { keys: ['Ctrl', 'V'],        desc: 'Вставить копию' },
  { keys: ['Ctrl', 'D'],        desc: 'Дублировать' },
  { keys: ['Ctrl', 'G'],        desc: 'Сгруппировать выбранные' },
  { keys: ['Ctrl', 'Z'],        desc: 'Отменить действие' },
  { keys: ['Del', 'Backspace'], desc: 'Удалить выбранный' },
  { keys: ['Esc'],              desc: 'Снять выделение' },
  { keys: ['Shift', 'Click'],   desc: 'Мультивыбор' },
  { keys: ['Dbl Click'],        desc: 'Редактировать текст' },
];

function HotkeysHint() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="btn btn-ghost btn-sm"
        style={{ width: 28, height: 28, padding: 0, borderRadius: '50%', fontSize: 13, fontWeight: 700, color: 'var(--t3)' }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(v => !v)}
        title="Горячие клавиши"
      >
        ?
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          background: 'var(--surface2)', border: '1px solid var(--border2)',
          borderRadius: 'var(--r-lg)', boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          zIndex: 2000, minWidth: 260, padding: '10px 0',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 14px 8px' }}>
            Горячие клавиши
          </div>
          {HOTKEYS.map(({ keys, desc }) => (
            <div key={desc} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 14px', gap: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--t2)' }}>{desc}</span>
              <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                {keys.map(k => (
                  <kbd key={k} style={{
                    fontSize: 10, fontFamily: 'inherit', fontWeight: 600,
                    background: 'var(--surface3)', color: 'var(--t1)',
                    border: '1px solid var(--border2)', borderBottom: '2px solid var(--border2)',
                    borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap',
                  }}>{k}</kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ResolutionModal ───────────────────────────────────────────────────────────
function ResolutionModal({ current, onClose, onSave }) {
  const [w, setW] = useState(current.w);
  const [h, setH] = useState(current.h);
  const mouseDownTarget = useRef(null);

  return (
    <div className="modal-backdrop"
      onMouseDown={e => { mouseDownTarget.current = e.target; }}
      onMouseUp={e => { if (mouseDownTarget.current === e.currentTarget && e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 420 }}>
        <div className="modal-header">
          <h2>Размер холста</h2>
          <button className="modal-close" onClick={onClose}><X /></button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 6 }}>Пресеты</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {PRESETS.map(p => (
                <button key={p.label}
                  className={`btn btn-sm ${w === p.w && h === p.h ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ justifyContent: 'flex-start', fontSize: 12 }}
                  onClick={() => { setW(p.w); setH(p.h); }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Ширина (px)</div>
              <input type="number" className="form-input" value={w} min={320} max={7680}
                onChange={e => setW(Math.max(320, Number(e.target.value)))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Высота (px)</div>
              <input type="number" className="form-input" value={h} min={240} max={4320}
                onChange={e => setH(Math.max(240, Number(e.target.value)))} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={() => { onSave(w, h); onClose(); }}>Применить</button>
        </div>
      </div>
    </div>
  );
}

// ── Add Object Menu ───────────────────────────────────────────────────────────
function AddObjectMenu({ onLibrary, onText, onUrl, onWidget, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const itemStyle = {
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
    cursor: 'pointer', fontSize: 13, color: 'var(--t1)',
    transition: 'background 0.1s',
  };

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', right: 0, marginTop: 4,
      background: 'var(--surface2)', border: '1px solid var(--border2)',
      borderRadius: 'var(--r-lg)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      zIndex: 1000, minWidth: 180, overflow: 'hidden',
    }}>
      <div
        style={itemStyle}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={() => { onLibrary(); onClose(); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--a1)" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
        </svg>
        Из библиотеки
      </div>
      <div style={{ height: 1, background: 'var(--border)', margin: '0 8px' }} />
      <div
        style={itemStyle}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={() => { onText(); onClose(); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7V4h16v3M9 20h6M12 4v16"/>
        </svg>
        Текст
      </div>
      <div style={{ height: 1, background: 'var(--border)', margin: '0 8px' }} />
      <div
        style={itemStyle}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={() => { onUrl(); onClose(); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2eaadc" strokeWidth="2" strokeLinecap="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        По URL
      </div>
      <div style={{ height: 1, background: 'var(--border)', margin: '0 8px' }} />
      <div
        style={itemStyle}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={() => { onWidget(); onClose(); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
        Виджет
      </div>
    </div>
  );
}

// ── SceneTimeline ─────────────────────────────────────────────────────────────
function SceneTimeline({ objects, selectedIds, onSelectId, sceneDuration, updateObjects, zoom, previewTime, onPreviewTime }) {
  const pxPerSec = TL_PX_PER_SEC * zoom;
  const tlDragState = useRef(null);
  const markerDragRef = useRef(false);
  const scrollRef = useRef(null);

  // Ruler ticks
  const totalSec = Math.max(sceneDuration, objects.reduce((m, o) => Math.max(m, (o.obj_start_time ?? 0) + getObjDuration(o)), 0));
  const step = totalSec > 60 ? 10 : totalSec > 30 ? 5 : 2;
  const ticks = [];
  for (let t = 0; t <= totalSec + step; t += step) ticks.push(t);

  // Real objects only (no groups)
  const realObjects = objects.filter(o => o.type !== 'group');

  const onBlockMouseDown = useCallback((e, obj, mode) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectId(obj.id);
    const pps = TL_PX_PER_SEC * zoom;
    const origStart = obj.obj_start_time ?? 0;
    const origDur = obj.obj_duration ?? 10;
    tlDragState.current = { mode, objId: obj.id, startX: e.clientX, origStart, origDur, lastStart: origStart, lastDur: origDur };

    const onMove = (e2) => {
      const ds = tlDragState.current;
      if (!ds) return;
      const dx = e2.clientX - ds.startX;
      if (ds.mode === 'move') {
        const newStart = Math.max(0, Math.round((ds.origStart + dx / pps) * 10) / 10);
        ds.lastStart = newStart;
        flushSync(() => {
          updateObjects(prev => prev.map(o => o.id === ds.objId ? { ...o, obj_start_time: newStart } : o), true);
        });
      } else {
        // resize right
        const newDur = Math.max(TL_MIN_DUR, Math.round((ds.origDur + dx / pps) * 10) / 10);
        ds.lastDur = newDur;
        flushSync(() => {
          updateObjects(prev => prev.map(o => o.id === ds.objId ? { ...o, obj_duration: newDur } : o), true);
        });
      }
    };

    const onUp = () => {
      const ds = tlDragState.current;
      tlDragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (ds) {
        updateObjects(prev => prev.map(o => {
          if (o.id !== ds.objId) return o;
          return { ...o, obj_start_time: ds.lastStart, obj_duration: ds.lastDur };
        }));
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [zoom, onSelectId, updateObjects]);

  const onMarkerMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    markerDragRef.current = true;
    const rect = scrollRef.current?.getBoundingClientRect();
    const onMove = (e2) => {
      if (!markerDragRef.current || !rect) return;
      const x = e2.clientX - rect.left + (scrollRef.current?.scrollLeft || 0);
      const t = Math.max(0, Math.min(totalSec, x / pxPerSec));
      onPreviewTime(Math.round(t * 10) / 10);
    };
    const onUp = () => {
      markerDragRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pxPerSec, totalSec, onPreviewTime]);

  const onRulerClick = useCallback((e) => {
    if (markerDragRef.current) return;
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft || 0);
    const t = Math.max(0, Math.min(totalSec, x / pxPerSec));
    onPreviewTime(Math.round(t * 10) / 10);
  }, [pxPerSec, totalSec, onPreviewTime]);

  const totalWidth = Math.max((totalSec + 10) * pxPerSec, 400);

  return (
    <div style={{ height: TL_RULER_H + realObjects.length * TL_ROW_H + 2, borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexShrink: 0, overflow: 'hidden' }}>
      {/* Left label column */}
      <div style={{ width: TL_LABEL_W, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        {/* Ruler placeholder */}
        <div style={{ height: TL_RULER_H, borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }} />
        {realObjects.map(obj => {
          const isSel = selectedIds.has(obj.id);
          const color = TYPE_COLORS[obj.type] || '#7c5cfc';
          return (
            <div key={obj.id}
              onClick={() => onSelectId(obj.id)}
              style={{ height: TL_ROW_H, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isSel ? 'var(--accent-soft)' : 'transparent', overflow: 'hidden' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t2)' }}>{obj.name}</span>
            </div>
          );
        })}
      </div>

      {/* Scrollable timeline area */}
      <div ref={scrollRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}>
        <div style={{ width: totalWidth, position: 'relative' }}>
          {/* Ruler */}
          <div
            style={{ height: TL_RULER_H, position: 'relative', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', cursor: 'crosshair' }}
            onClick={onRulerClick}
          >
            {ticks.map(t => (
              <div key={t} style={{ position: 'absolute', left: t * pxPerSec, top: 0, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', pointerEvents: 'none' }}>
                <div style={{ width: 1, height: 8, background: 'var(--border2)', marginTop: 'auto' }} />
                <span style={{ fontSize: 9, color: 'var(--t3)', paddingLeft: 2, paddingBottom: 2, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{t}s</span>
              </div>
            ))}
            {/* Scene end marker on ruler */}
            <div style={{ position: 'absolute', left: sceneDuration * pxPerSec, top: 0, width: 2, height: '100%', background: '#ef4444', opacity: 0.7, pointerEvents: 'none' }} />
            {/* Playhead on ruler */}
            {previewTime != null && (
              <div
                style={{ position: 'absolute', left: previewTime * pxPerSec, top: 0, width: 2, height: '100%', background: '#fff', zIndex: 10, cursor: 'ew-resize' }}
                onMouseDown={onMarkerMouseDown}
              >
                {/* Playhead triangle cap */}
                <div style={{ position: 'absolute', top: 0, left: -4, width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '8px solid #fff' }} />
              </div>
            )}
          </div>

          {/* Rows */}
          {realObjects.map(obj => {
            const isSel = selectedIds.has(obj.id);
            const color = TYPE_COLORS[obj.type] || '#7c5cfc';
            const objStart = obj.obj_start_time ?? 0;
            const objDur = getObjDuration(obj);
            const blockLeft = objStart * pxPerSec;
            const blockWidth = Math.max(4, objDur * pxPerSec);
            const locked = isScrollLocked(obj);

            return (
              <div key={obj.id}
                style={{ height: TL_ROW_H, position: 'relative', borderBottom: '1px solid var(--border)', background: isSel ? `${color}08` : 'transparent' }}>
                {/* Scene end vertical line */}
                <div style={{ position: 'absolute', left: sceneDuration * pxPerSec, top: 0, width: 1, height: '100%', background: 'rgba(239,68,68,0.25)', pointerEvents: 'none' }} />

                {/* Playhead vertical line across rows */}
                {previewTime != null && (
                  <div style={{ position: 'absolute', left: previewTime * pxPerSec, top: 0, width: 2, background: 'rgba(255,255,255,0.5)', height: '100%', pointerEvents: 'none', zIndex: 5 }} />
                )}

                {/* Object block */}
                <div
                  style={{
                    position: 'absolute',
                    left: blockLeft,
                    top: 4,
                    width: blockWidth,
                    height: TL_ROW_H - 8,
                    background: isSel ? `${color}44` : `${color}28`,
                    border: `1.5px solid ${isSel ? color : color + '88'}`,
                    borderRadius: 4,
                    cursor: 'grab',
                    userSelect: 'none',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  onMouseDown={e => onBlockMouseDown(e, obj, 'move')}
                  onClick={e => { e.stopPropagation(); onSelectId(obj.id); }}
                >
                  <span style={{ fontSize: 9, color, fontWeight: 600, padding: '0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{obj.name}</span>
                  {/* Resize handle right — hidden for scroll-locked objects */}
                  {!locked && (
                    <div
                      style={{ position: 'absolute', right: 0, top: 0, width: 6, height: '100%', cursor: 'e-resize', background: `${color}55`, zIndex: 2 }}
                      onMouseDown={e => { e.stopPropagation(); onBlockMouseDown(e, obj, 'resize'); }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main SceneEditor ──────────────────────────────────────────────────────────
export default function SceneEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  const [scene, setScene] = useState(null);
  const [objects, setObjects] = useState([]);
  const [groups, setGroups] = useState([]); // { id, name, objectIds: [], collapsed: false }
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [denied, setDenied] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);
  const [showResolution, setShowResolution] = useState(false);
  const [editingTextId, setEditingTextId] = useState(null);

  const [canvasW, setCanvasW] = useState(1920);
  const [canvasH, setCanvasH] = useState(1080);
  const canvasSizeRef = useRef({ w: 1920, h: 1080 });
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [showTimeline, setShowTimeline] = useState(false);
  const [previewTime, setPreviewTime] = useState(null);
  const sceneDurationRef = useRef(30);

  const canvasContainerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const dragState = useRef(null);
  const clipboard = useRef(null);
  const saveTimer = useRef(null);
  const addMenuRef = useRef(null);
  // Undo history: stack of {objects, groups} snapshots
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);

  const pushHistory = useCallback((objs, grps) => {
    // Trim forward history on new action
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push({ objects: objs, groups: grps });
    if (historyRef.current.length > 50) historyRef.current.shift();
    historyIndexRef.current = historyRef.current.length - 1;
  }, []);

  // Compute canvas scale to fit container
  const updateScale = useCallback(() => {
    if (!canvasContainerRef.current) return;
    const { width, height } = canvasContainerRef.current.getBoundingClientRect();
    const { w, h } = canvasSizeRef.current;
    const sx = (width - 32) / w;
    const sy = (height - 32) / h;
    setScale(Math.min(sx, sy, 1));
  }, []);

  useEffect(() => {
    updateScale();
    window.addEventListener('resize', updateScale);
    const ro = new ResizeObserver(updateScale);
    if (canvasContainerRef.current) ro.observe(canvasContainerRef.current);
    return () => { window.removeEventListener('resize', updateScale); ro.disconnect(); };
  }, [updateScale, scene]); // re-run when scene loads so canvasContainerRef is now in DOM

  // Recompute scale when canvas dimensions change
  useEffect(() => {
    canvasSizeRef.current = { w: canvasW, h: canvasH };
    // Use rAF so the DOM has committed the new canvas size before we measure
    const raf = requestAnimationFrame(updateScale);
    return () => cancelAnimationFrame(raf);
  }, [canvasW, canvasH, updateScale]);

  // Load scene
  const loadScene = useCallback(() => {
    api.getScene(id).then(data => {
      setScene(data);
      sceneDurationRef.current = data.duration ?? 30;
      const w = data.width  || 1920;
      const h = data.height || 1080;
      canvasSizeRef.current = { w, h };
      setCanvasW(w);
      setCanvasH(h);
      const allObjects = data.objects || [];
      const realObjs = allObjects.filter(o => o.type !== 'group');
      const groupObjs = allObjects.filter(o => o.type === 'group');
      setObjects(realObjs);
      setGroups(groupObjs.map(g => ({
        id: g.id,
        name: g.name || 'Группа',
        objectIds: g.objectIds || [],
        collapsed: g.collapsed || false,
      })));
    }).catch(e => {
      if (e instanceof PermissionError) setDenied(true);
    });
  }, [id]);

  useEffect(() => { loadScene(); }, [loadScene]);

  const loadVersions = useCallback(async () => {
    setVersionsLoading(true);
    try { setVersions(await api.getSceneVersions(id)); }
    catch { /* ignore */ }
    finally { setVersionsLoading(false); }
  }, [id]);

  const saveVersion = useCallback(async () => {
    const label = window.prompt('Название версии (необязательно):');
    if (label === null) return;
    try {
      await api.createSceneVersion(id, { label: label.trim() || undefined });
      await loadVersions();
    } catch (e) { alert('Ошибка: ' + e.message); }
  }, [id, loadVersions]);

  const restoreVersion = useCallback(async (vid) => {
    if (!window.confirm('Восстановить эту версию? Текущее состояние будет заменено.')) return;
    try {
      await api.restoreSceneVersion(id, vid);
      loadScene();
      await loadVersions();
    } catch (e) { alert('Ошибка: ' + e.message); }
  }, [id, loadScene, loadVersions]);

  const deleteVersion = useCallback(async (vid) => {
    if (!window.confirm('Удалить эту версию?')) return;
    try {
      await api.deleteSceneVersion(id, vid);
      setVersions(v => v.filter(x => x.id !== vid));
    } catch (e) { alert('Ошибка: ' + e.message); }
  }, [id]);

  // Auto-save debounced
  const scheduleSave = useCallback((objs, grps) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const groupPseudos = (grps || groups).map(g => ({
          id: g.id,
          type: 'group',
          name: g.name,
          objectIds: g.objectIds,
          collapsed: g.collapsed,
          z: -1, x: 0, y: 0, w: 0, h: 0,
        }));
        // For widget objects, store the render URL so APK player can display them as webpages
        const serialized = objs.map(o =>
          o.type === 'widget' && o.props?.widgetType
            ? { ...o, url: buildWidgetUrl(o.props.widgetType, o.props) }
            : o
        );
        await api.saveSceneObjects(id, [...serialized, ...groupPseudos]);
      } catch (e) {
        if (e instanceof PermissionError) return;
      } finally { setSaving(false); }
    }, 800);
  }, [id, groups]);

  const updateObjects = useCallback((fn, skipHistory = false) => {
    setObjects(prev => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      scheduleSave(next, null);
      if (!skipHistory) {
        setGroups(grps => { pushHistory(next, grps); return grps; });
      }
      return next;
    });
  }, [scheduleSave, pushHistory]);

  const updateGroups = useCallback((fn, skipHistory = false) => {
    setGroups(prev => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      setObjects(objs => {
        scheduleSave(objs, next);
        if (!skipHistory) pushHistory(objs, next);
        return objs;
      });
      return next;
    });
  }, [scheduleSave, pushHistory]);

  // Derived: selected objects (only real objects)
  const selectedObjs = objects.filter(o => selectedIds.has(o.id));
  const selectedObj = selectedObjs.length === 1 ? selectedObjs[0] : null;

  // Find which group is "selected" (all members selected)
  const selectedGroup = groups.find(g =>
    g.objectIds.length > 0 && g.objectIds.every(id => selectedIds.has(id))
  );

  // Add object from content library
  const addObject = useCallback((content) => {
    const newObj = {
      id: `new-${Date.now()}`,
      content_id: content.id,
      name: content.name,
      type: content.type,
      url: content.url,
      html: content.html,
      filename: content.filename,
      scroll_behavior: content.scroll_behavior,
      page_duration: content.page_duration,
      muted: content.muted,
      x: snap(canvasW / 2 - 480),
      y: snap(canvasH / 2 - 270),
      w: Math.min(960, canvasW),
      h: Math.min(540, canvasH),
      z: objects.length,
      props: {
        scroll_behavior: content.scroll_behavior ?? 'none',
        scroll_speed: content.scroll_speed ?? 100,
      },
      obj_start_time: 0,
      obj_duration: sceneDurationRef.current,
      transition_in: 'none',
      transition_out: 'none',
    };
    updateObjects(prev => [...prev, newObj]);
    setSelectedIds(new Set([newObj.id]));
    setShowPicker(false);
  }, [objects.length, updateObjects]);

  // Add text object
  const addTextObject = useCallback(() => {
    const newObj = {
      id: `new-${Date.now()}`,
      content_id: null,
      name: 'Текст',
      type: 'text',
      url: null,
      x: snap(canvasW / 2 - 200),
      y: snap(canvasH / 2 - 100),
      w: 400,
      h: 200,
      z: objects.length,
      props: {
        text: 'Текст',
        fontSize: 48,
        fontFamily: 'Inter',
        color: '#ffffff',
        align: 'center',
        valign: 'middle',
        bold: false,
        italic: false,
        lineHeight: 1.2,
        bgColor: '',
        bgOpacity: 0,
      },
      obj_start_time: 0,
      obj_duration: sceneDurationRef.current,
      transition_in: 'none',
      transition_out: 'none',
    };
    updateObjects(prev => [...prev, newObj]);
    setSelectedIds(new Set([newObj.id]));
  }, [objects.length, updateObjects, canvasW, canvasH]);

  // Add object by URL
  const addObjectByUrl = useCallback(({ url, type, name }) => {
    const newObj = {
      id: `new-${Date.now()}`,
      content_id: null,
      name,
      type,
      url,
      x: snap(canvasW / 2 - 480),
      y: snap(canvasH / 2 - 270),
      w: Math.min(960, canvasW),
      h: Math.min(540, canvasH),
      z: objects.length,
      props: {
        scroll_behavior: 'none',
        scroll_speed: 100,
      },
      obj_start_time: 0,
      obj_duration: sceneDurationRef.current,
      transition_in: 'none',
      transition_out: 'none',
    };
    updateObjects(prev => [...prev, newObj]);
    setSelectedIds(new Set([newObj.id]));
  }, [objects.length, updateObjects, canvasW, canvasH]);

  // Add widget object
  const addWidgetObject = useCallback((widgetType) => {
    const defaults = WIDGET_DEFAULTS[widgetType] || {};
    const props = { ...defaults, widgetType };
    const widgetInfo = WIDGET_TYPES.find(w => w.key === widgetType);
    const defaultSizes = {
      clock: [400, 200], qr: [300, 300], text_ticker: [canvasW, 100],
      weather: [360, 320], currency: [400, 300], countdown: [500, 200], rss: [500, 400],
    };
    const [dw, dh] = defaultSizes[widgetType] || [400, 300];
    const newObj = {
      id: `new-${Date.now()}`,
      content_id: null,
      name: widgetInfo?.label || 'Виджет',
      type: 'widget',
      url: null,
      html: null,
      x: snap(Math.max(0, canvasW / 2 - dw / 2)),
      y: snap(Math.max(0, canvasH / 2 - dh / 2)),
      w: dw,
      h: dh,
      z: objects.length,
      props,
      obj_start_time: 0,
      obj_duration: sceneDurationRef.current,
      transition_in: 'none',
      transition_out: 'none',
    };
    updateObjects(prev => [...prev, newObj]);
    setSelectedIds(new Set([newObj.id]));
    setShowWidgetPicker(false);
  }, [objects.length, updateObjects, canvasW, canvasH]);

  // Delete selected
  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const idsToDelete = new Set(selectedIds);
    updateObjects(prev => prev.filter(o => !idsToDelete.has(o.id)));
    // Remove from groups
    updateGroups(prev => prev
      .map(g => ({ ...g, objectIds: g.objectIds.filter(id => !idsToDelete.has(id)) }))
      .filter(g => g.objectIds.length > 0)
    );
    setSelectedIds(new Set());
  }, [selectedIds, updateObjects, updateGroups]);

  // Group selected objects (Ctrl+G)
  const groupSelected = useCallback(() => {
    if (selectedIds.size < 2) return;
    const newGroup = {
      id: `group-${Date.now()}`,
      name: 'Группа',
      objectIds: Array.from(selectedIds),
      collapsed: false,
    };
    updateGroups(prev => [...prev, newGroup]);
  }, [selectedIds, updateGroups]);

  // Ungroup
  const ungroupGroup = useCallback((groupId) => {
    updateGroups(prev => prev.filter(g => g.id !== groupId));
  }, [updateGroups]);

  // Keep a ref to current objects/selectedIds to avoid stale closures in keyboard handler
  const objectsRef = useRef(objects);
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => { objectsRef.current = objects; }, [objects]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  const editorRef = useRef(null);

  // Храним актуальные функции в рефах чтобы обработчик клавиш не пересоздавался
  const deleteSelectedRef = useRef(deleteSelected);
  const groupSelectedRef = useRef(groupSelected);
  const updateObjectsRef = useRef(updateObjects);
  const scheduleSaveRef = useRef(scheduleSave);
  useEffect(() => { deleteSelectedRef.current = deleteSelected; }, [deleteSelected]);
  useEffect(() => { groupSelectedRef.current = groupSelected; }, [groupSelected]);
  useEffect(() => { updateObjectsRef.current = updateObjects; }, [updateObjects]);
  useEffect(() => { scheduleSaveRef.current = scheduleSave; }, [scheduleSave]);

  // Keyboard — document capture, регистрируется один раз
  useEffect(() => {
    const handler = (e) => {
      const active = document.activeElement;
      const inInput = active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.contentEditable === 'true';
      const ctrl = e.ctrlKey || e.metaKey;
      // e.code — физическая клавиша, не зависит от раскладки (KeyC, KeyV, ...)
      const code = e.code;

      // Блокируем браузерные команды для всех редакторских шорткатов
      if (ctrl && !inInput && ['KeyC','KeyV','KeyZ','KeyD','KeyG'].includes(code)) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (code === 'Escape') {
        e.preventDefault();
        setEditingTextId(null);
        if (active.contentEditable === 'true') active.blur();
        if (!inInput) setSelectedIds(new Set());
        return;
      }

      if (inInput) return;

      if (code === 'Delete' || code === 'Backspace') {
        e.preventDefault();
        deleteSelectedRef.current();
        return;
      }

      if (ctrl && code === 'KeyZ') {
        const idx = historyIndexRef.current;
        if (idx < 1) return;
        historyIndexRef.current = idx - 1;
        const prev = historyRef.current[idx - 1];
        setObjects(prev.objects);
        setGroups(prev.groups);
        scheduleSaveRef.current(prev.objects, prev.groups);
        return;
      }

      if (ctrl && code === 'KeyG') {
        groupSelectedRef.current();
        return;
      }

      if (ctrl && code === 'KeyC') {
        const selIds = selectedIdsRef.current;
        const objs = objectsRef.current;
        if (selIds.size >= 1) {
          const id = [...selIds][0];
          const obj = objs.find(o => o.id === id);
          if (obj) clipboard.current = { ...obj };
        }
        return;
      }

      if (ctrl && (code === 'KeyV' || code === 'KeyD')) {
        const src = clipboard.current;
        if (!src) return;
        const { w: cw, h: ch } = canvasSizeRef.current;
        const copy = {
          ...src,
          id: `new-${Date.now()}`,
          x: snap(Math.min(src.x + 20, cw - src.w)),
          y: snap(Math.min(src.y + 20, ch - src.h)),
        };
        updateObjectsRef.current(prev => [...prev, { ...copy, z: prev.length }]);
        setSelectedIds(new Set([copy.id]));
        clipboard.current = { ...copy };
        return;
      }
    };

    document.addEventListener('keydown', handler, { capture: true });
    return () => document.removeEventListener('keydown', handler, { capture: true });
  }, []); // пустой массив — регистрируется один раз, всё читается через рефы

  // ── Drag & Resize on canvas ───────────────────────────────────────────────
  const onMouseDown = useCallback((e, objId, mode) => {
    // Don't intercept shift-clicks — handled by onClick
    if (e.shiftKey) return;

    e.preventDefault();
    e.stopPropagation();

    // If editing text and click another object — commit first
    if (editingTextId && editingTextId !== objId) {
      const el = document.querySelector('[contenteditable="true"]');
      if (el) el.blur();
      setEditingTextId(null);
    }

    // Если объект входит в группу — выделяем и двигаем всю группу
    const clickedGroup = groups.find(g => g.objectIds.includes(objId));

    if (clickedGroup) {
      setSelectedIds(new Set(clickedGroup.objectIds));
    } else {
      setSelectedIds(new Set([objId]));
    }

    const obj = objects.find(o => o.id === objId);
    if (!obj) return;

    const moveIds = clickedGroup ? clickedGroup.objectIds : [objId];

    // Snapshot original positions
    const origPositions = {};
    moveIds.forEach(mid => {
      const o = objects.find(x => x.id === mid);
      if (o) origPositions[mid] = { x: o.x, y: o.y, w: o.w, h: o.h };
    });

    dragState.current = {
      mode,
      objId,
      moveIds,
      origPositions,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };

    const onMove = (e2) => {
      const ds = dragState.current;
      if (!ds) return;
      const dx = (e2.clientX - ds.startX) / scale;
      const dy = (e2.clientY - ds.startY) / scale;
      if (!ds.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      ds.moved = true;

      // skipHistory=true во время движения — пишем в историю только в mouseup
      updateObjects(prev => prev.map(o => {
        if (!ds.moveIds.includes(o.id)) return o;
        const orig = ds.origPositions[o.id];
        if (!orig) return o;

        if (ds.mode === 'move') {
          return { ...o, x: snap(Math.max(0, Math.min(canvasW - o.w, orig.x + dx))), y: snap(Math.max(0, Math.min(canvasH - o.h, orig.y + dy))) };
        }
        // resize
        if (o.id !== ds.objId) return o;
        let { x, y, w, h } = o;
        if (ds.mode.includes('e')) w = Math.max(MIN_SIZE, snap(orig.w + dx));
        if (ds.mode.includes('s')) h = Math.max(MIN_SIZE, snap(orig.h + dy));
        if (ds.mode.includes('w')) { w = Math.max(MIN_SIZE, snap(orig.w - dx)); x = snap(orig.x + orig.w - w); }
        if (ds.mode.includes('n')) { h = Math.max(MIN_SIZE, snap(orig.h - dy)); y = snap(orig.y + orig.h - h); }
        return { ...o, x, y, w, h };
      }), true); // skipHistory
    };

    const onUp = () => {
      const ds = dragState.current;
      // Пушим в историю только если объект реально переместился
      if (ds && ds.moved) {
        setObjects(objs => {
          setGroups(grps => { pushHistory(objs, grps); return grps; });
          return objs;
        });
      }
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [objects, scale, updateObjects, groups, selectedIds, editingTextId]);

  // Z-order
  const bringForward = (objId) => updateObjects(prev => {
    const idx = prev.findIndex(o => o.id === objId);
    if (idx >= prev.length - 1) return prev;
    const next = [...prev];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    return next.map((o, i) => ({ ...o, z: i }));
  });

  const sendBackward = (objId) => updateObjects(prev => {
    const idx = prev.findIndex(o => o.id === objId);
    if (idx <= 0) return prev;
    const next = [...prev];
    [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
    return next.map((o, i) => ({ ...o, z: i }));
  });

  // Layer reorder handler — draggingIdx/targetIdx are indices into displayItems
  const handleLayerReorder = useCallback((draggingIdx, targetIdx, displayItems) => {
    const dragItem = displayItems[draggingIdx];
    const targetItem = displayItems[targetIdx];
    if (!dragItem || !targetItem || draggingIdx === targetIdx) return;

    if ((dragItem.kind === 'object' || dragItem.kind === 'member') &&
        (targetItem.kind === 'object' || targetItem.kind === 'member')) {
      updateObjects(prev => {
        const fromId = dragItem.obj.id;
        const toId = targetItem.obj.id;
        const fromIdx = prev.findIndex(o => o.id === fromId);
        const toIdx = prev.findIndex(o => o.id === toId);
        if (fromIdx === -1 || toIdx === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        const insertAt = fromIdx < toIdx ? toIdx : toIdx;
        next.splice(insertAt, 0, moved);
        return next.map((o, i) => ({ ...o, z: i }));
      });
    } else if (dragItem.kind === 'group' && targetItem.kind === 'group') {
      updateGroups(prev => {
        const fromIdx = prev.findIndex(g => g.id === dragItem.group.id);
        const toIdx = prev.findIndex(g => g.id === targetItem.group.id);
        if (fromIdx === -1 || toIdx === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        return next;
      });
    }
  }, [updateObjects, updateGroups]);

  // Layer panel callbacks
  const handleLayerSelect = useCallback((ids, additive) => {
    if (additive) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.add(id));
        return next;
      });
    } else {
      setSelectedIds(new Set(ids));
    }
  }, []);

  const handleAddToSelection = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleLayerRemove = useCallback((objId, groupId) => {
    if (groupId) {
      // Remove group (ungroup)
      updateGroups(prev => prev.filter(g => g.id !== groupId));
    } else if (objId) {
      updateObjects(prev => prev.filter(o => o.id !== objId));
      updateGroups(prev => prev
        .map(g => ({ ...g, objectIds: g.objectIds.filter(id => id !== objId) }))
        .filter(g => g.objectIds.length > 0)
      );
      setSelectedIds(prev => { const next = new Set(prev); next.delete(objId); return next; });
    }
  }, [updateObjects, updateGroups]);

  const handleGroupCollapse = useCallback((groupId) => {
    updateGroups(prev => prev.map(g => g.id === groupId ? { ...g, collapsed: !g.collapsed } : g));
  }, [updateGroups]);

  const handleGroupRename = useCallback((groupId, name) => {
    updateGroups(prev => prev.map(g => g.id === groupId ? { ...g, name } : g));
  }, [updateGroups]);

  const handleTimelineSelect = useCallback((objId) => {
    setSelectedIds(new Set([objId]));
  }, []);

  if (denied) return <AccessDenied />;
  if (!scene) return <div style={{ color: 'var(--t3)', padding: '48px 0', textAlign: 'center' }}>Загрузка...</div>;

  const HANDLE_SIZE = 8 / scale;

  const handles = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  const handlePos = (h, obj) => {
    const cx = obj.w / 2, cy = obj.h / 2;
    const map = { n: [cx, 0], ne: [obj.w, 0], e: [obj.w, cy], se: [obj.w, obj.h], s: [cx, obj.h], sw: [0, obj.h], w: [0, cy], nw: [0, 0] };
    return map[h];
  };
  const handleCursor = { n: 'n-resize', ne: 'ne-resize', e: 'e-resize', se: 'se-resize', s: 's-resize', sw: 'sw-resize', w: 'w-resize', nw: 'nw-resize' };

  // For canvas multiselect outline
  const isMultiSelected = selectedIds.size > 1;
  const canEdit = hasPerm('scenes.edit_any') || hasPerm('scenes.edit_own');

  return (
    <div ref={editorRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {!canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', background: 'rgba(245,158,11,0.1)', borderBottom: '1px solid rgba(245,158,11,0.25)', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 500 }}>Режим просмотра — у вас нет прав на редактирование этой сцены</span>
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
          <h1 style={{ fontSize: 18, margin: 0 }}>{scene.name}</h1>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowResolution(true)} style={{ fontSize: 11, color: 'var(--t3)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>
            {canvasW}×{canvasH}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 11, color: 'var(--t3)' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <input
              type="number"
              min={1}
              step={1}
              value={scene.duration ?? 30}
              onChange={e => {
                const dur = Math.max(1, Number(e.target.value));
                sceneDurationRef.current = dur;
                setScene(prev => ({ ...prev, duration: dur }));
                api.updateScene(id, { duration: dur }).catch(e => { if (!(e instanceof PermissionError)) console.error(e); });
              }}
              style={{ width: 44, background: 'none', border: 'none', outline: 'none', fontSize: 11, color: 'var(--t2)', padding: 0, textAlign: 'center' }}
            />
            <span>с</span>
          </div>
          {saving && <span style={{ fontSize: 11, color: 'var(--t3)' }}>Сохранение...</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <HotkeysHint />
        {hasPerm('scenes.versions') && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setVersionsOpen(v => !v); if (!versionsOpen) loadVersions(); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 4 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            История
          </button>
        )}
        {(hasPerm('scenes.edit_any') || hasPerm('scenes.edit_own')) && (
          <div style={{ position: 'relative' }} ref={addMenuRef}>
            <button className="btn btn-primary" onClick={() => setShowAddMenu(v => !v)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              Добавить объект
            </button>
            {showAddMenu && (
              <AddObjectMenu
                onLibrary={() => setShowPicker(true)}
                onText={addTextObject}
                onUrl={() => setShowUrlModal(true)}
                onWidget={() => setShowWidgetPicker(true)}
                onClose={() => setShowAddMenu(false)}
              />
            )}
          </div>
        )}
        </div>
      </div>

      {/* Editor layout */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 0, overflow: 'hidden' }}>

        {/* Canvas area */}
        <div ref={canvasContainerRef}
          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', overflow: 'hidden', padding: 16 }}
          onClick={() => { setSelectedIds(new Set()); setEditingTextId(null); }}>
          <div style={{ position: 'relative', width: canvasW * scale, height: canvasH * scale, flexShrink: 0 }}>
            {/* Canvas background */}
            <div style={{
              position: 'absolute', inset: 0,
              background: '#0f1117',
              backgroundImage: `linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)`,
              backgroundSize: `${GRID * scale}px ${GRID * scale}px`,
              boxShadow: '0 8px 48px rgba(0,0,0,0.6)',
            }} />

            {/* Objects */}
            {objects.map((obj) => {
              const isSel = selectedIds.has(obj.id);
              const isEditing = editingTextId === obj.id;
              const objStart = obj.obj_start_time ?? 0;
              const objEnd = objStart + (obj.obj_duration ?? 10);
              const atPreview = previewTime != null;
              const visibleAtPreview = !atPreview || (previewTime >= objStart && previewTime < objEnd);
              return (
                <div key={obj.id}
                  style={{
                    position: 'absolute',
                    left: obj.x * scale,
                    top: obj.y * scale,
                    width: obj.w * scale,
                    height: obj.h * scale,
                    outline: isSel ? `2px solid var(--a1)` : '1px solid rgba(255,255,255,0.08)',
                    outlineOffset: isSel ? 0 : -1,
                    cursor: isEditing ? 'text' : 'move',
                    zIndex: obj.z + 1,
                    overflow: isSel ? 'visible' : 'hidden',
                    userSelect: 'none',
                    opacity: atPreview && !visibleAtPreview ? 0.2 : 1,
                    transition: 'opacity 0.15s',
                  }}
                  onMouseDown={e => {
                    onMouseDown(e, obj.id, 'move');
                  }}
                  onClick={e => {
                    e.stopPropagation();
                    if (e.shiftKey) {
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        if (next.has(obj.id)) next.delete(obj.id);
                        else next.add(obj.id);
                        return next;
                      });
                    }
                  }}
                  onDoubleClick={e => {
                    e.stopPropagation();
                    if (obj.type === 'text') {
                      setEditingTextId(obj.id);
                    }
                  }}
                >
                  {/* Content preview */}
                  <div style={{ width: '100%', height: '100%', overflow: isEditing ? 'visible' : 'hidden' }}>
                    <ObjectPreview
                      obj={obj}
                      scale={scale}
                      editing={isEditing}
                      onTextCommit={text => {
                        updateObjects(prev => prev.map(o => o.id === obj.id ? { ...o, props: { ...o.props, text } } : o));
                        setEditingTextId(null);
                      }}
                    />
                  </div>

                  {/* Label */}
                  {isSel && !isEditing && (
                    <div style={{
                      position: 'absolute', top: -20, left: 0, fontSize: 11, fontWeight: 600,
                      background: 'var(--a1)', color: '#fff', padding: '1px 6px', borderRadius: 4,
                      whiteSpace: 'nowrap', pointerEvents: 'none', lineHeight: '18px',
                    }}>{obj.name}</div>
                  )}

                  {/* Resize handles */}
                  {isSel && !isEditing && handles.map(h => {
                    const [hx, hy] = handlePos(h, { w: obj.w * scale, h: obj.h * scale });
                    return (
                      <div key={h}
                        style={{
                          position: 'absolute',
                          left: hx - HANDLE_SIZE * scale / 2,
                          top: hy - HANDLE_SIZE * scale / 2,
                          width: HANDLE_SIZE * scale,
                          height: HANDLE_SIZE * scale,
                          background: '#fff',
                          border: '2px solid var(--a1)',
                          borderRadius: 2,
                          cursor: handleCursor[h],
                          zIndex: 10,
                        }}
                        onMouseDown={e => onMouseDown(e, obj.id, h)}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width: 270, flexShrink: 0, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)', overflowY: 'auto' }}>

          {/* Properties panel */}
          {selectedObj ? (
            <div style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ padding: '12px 16px 0' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Свойства</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  {[['X', 'x'], ['Y', 'y'], ['Ширина', 'w'], ['Высота', 'h']].map(([label, key]) => (
                    <div key={key}>
                      <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>{label}</div>
                      <input type="number" className="form-input" style={{ padding: '5px 8px', fontSize: 12 }}
                        value={selectedObj[key]}
                        onChange={e => {
                          const val = snap(Math.max(key === 'w' || key === 'h' ? MIN_SIZE : 0, Number(e.target.value)));
                          updateObjects(prev => prev.map(o => o.id === selectedObj.id ? { ...o, [key]: val } : o));
                        }} />
                    </div>
                  ))}
                </div>

                <button className="btn btn-ghost btn-sm" style={{ width: '100%', fontSize: 11, marginBottom: 6 }}
                  onClick={() => updateObjects(prev => prev.map(o => o.id === selectedObj.id ? { ...o, x: 0, y: 0, w: canvasW, h: canvasH } : o))}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>
                  На весь холст
                </button>

                {/* Timing */}
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', margin: '8px 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Таймлайн</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Начало (с)</div>
                    <input type="number" className="form-input" style={{ padding: '5px 8px', fontSize: 12 }} min={0} step={0.1}
                      value={selectedObj.obj_start_time ?? 0}
                      onChange={e => updateObjects(prev => prev.map(o => o.id === selectedObj.id ? { ...o, obj_start_time: Math.max(0, Number(e.target.value)) } : o))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Длит. (с)</div>
                    {isScrollLocked(selectedObj) ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', fontSize: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--t2)' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        {getObjDuration(selectedObj)} с
                        <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 'auto' }}>задаётся скоростью</span>
                      </div>
                    ) : (
                      <input type="number" className="form-input" style={{ padding: '5px 8px', fontSize: 12 }} min={TL_MIN_DUR} step={0.1}
                        value={selectedObj.obj_duration ?? 10}
                        onChange={e => updateObjects(prev => prev.map(o => o.id === selectedObj.id ? { ...o, obj_duration: Math.max(TL_MIN_DUR, Number(e.target.value)) } : o))} />
                    )}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Вход</div>
                    <select className="form-input" style={{ padding: '5px 6px', fontSize: 11, width: '100%' }}
                      value={selectedObj.transition_in ?? 'none'}
                      onChange={e => updateObjects(prev => prev.map(o => o.id === selectedObj.id ? { ...o, transition_in: e.target.value } : o))}>
                      <option value="none">Нет</option>
                      <option value="fade">Fade</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Выход</div>
                    <select className="form-input" style={{ padding: '5px 6px', fontSize: 11, width: '100%' }}
                      value={selectedObj.transition_out ?? 'none'}
                      onChange={e => updateObjects(prev => prev.map(o => o.id === selectedObj.id ? { ...o, transition_out: e.target.value } : o))}>
                      <option value="none">Нет</option>
                      <option value="fade">Fade</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1, fontSize: 11 }} onClick={() => bringForward(selectedObj.id)} title="На уровень выше">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                    Вперёд
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1, fontSize: 11 }} onClick={() => sendBackward(selectedObj.id)} title="На уровень ниже">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                    Назад
                  </button>
                </div>

                {(hasPerm('scenes.edit_any') || hasPerm('scenes.edit_own')) && (
                  <button className="btn btn-danger btn-sm" style={{ width: '100%', fontSize: 12, marginBottom: 12 }} onClick={deleteSelected}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                    Удалить объект
                  </button>
                )}
              </div>

              {/* Text properties panel */}
              {selectedObj.type === 'text' && (
                <TextPropsPanel
                  obj={selectedObj}
                  onChange={updatedObj => {
                    updateObjects(prev => prev.map(o => o.id === updatedObj.id ? updatedObj : o));
                  }}
                />
              )}

              {/* Widget properties panel */}
              {selectedObj.type === 'widget' && (
                <WidgetPropsPanel
                  obj={selectedObj}
                  onChange={updatedObj => {
                    updateObjects(prev => prev.map(o => o.id === updatedObj.id ? updatedObj : o));
                  }}
                />
              )}
            </div>
          ) : selectedGroup ? (
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Группа</div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>Название</div>
                <input
                  className="form-input"
                  style={{ padding: '5px 8px', fontSize: 12, width: '100%' }}
                  value={selectedGroup.name}
                  onChange={e => handleGroupRename(selectedGroup.id, e.target.value)}
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 10 }}>{selectedGroup.objectIds.length} объектов</div>
              <button className="btn btn-ghost btn-sm" style={{ width: '100%', fontSize: 12, marginBottom: 6 }}
                onClick={() => ungroupGroup(selectedGroup.id)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
                Разгруппировать
              </button>
              {(hasPerm('scenes.edit_any') || hasPerm('scenes.edit_own')) && (
                <button className="btn btn-danger btn-sm" style={{ width: '100%', fontSize: 12 }} onClick={deleteSelected}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  Удалить объекты группы
                </button>
              )}
            </div>
          ) : isMultiSelected ? (
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Выбрано</div>
              <div style={{ fontSize: 12, color: 'var(--t1)', marginBottom: 10 }}>{selectedIds.size} объектов</div>
              <button className="btn btn-ghost btn-sm" style={{ width: '100%', fontSize: 12, marginBottom: 6 }}
                onClick={groupSelected}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M2 9V5a2 2 0 0 1 2-2h3M2 15v4a2 2 0 0 0 2 2h3M22 9V5a2 2 0 0 0-2-2h-3M22 15v4a2 2 0 0 1-2 2h-3"/>
                </svg>
                Сгруппировать (Ctrl+Shift+G)
              </button>
              {(hasPerm('scenes.edit_any') || hasPerm('scenes.edit_own')) && (
                <button className="btn btn-danger btn-sm" style={{ width: '100%', fontSize: 12 }} onClick={deleteSelected}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  Удалить выбранные
                </button>
              )}
            </div>
          ) : (
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)', color: 'var(--t3)', fontSize: 12, textAlign: 'center', flexShrink: 0 }}>
              Выберите объект на холсте
            </div>
          )}

          {/* Layers panel */}
          <LayersPanel
            objects={objects}
            selectedIds={selectedIds}
            groups={groups}
            onSelect={handleLayerSelect}
            onRemove={handleLayerRemove}
            onReorder={handleLayerReorder}
            onGroupCollapse={handleGroupCollapse}
            onGroupRename={handleGroupRename}
            onAddToSelection={handleAddToSelection}
          />
        </div>
      </div>

      {/* Timeline toggle + panel */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)' }}>
        <div
          onClick={() => setShowTimeline(v => { if (v) setPreviewTime(null); return !v; })}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer', background: 'var(--surface)', userSelect: 'none' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            style={{ transition: 'transform 0.15s', transform: showTimeline ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <path d="M18 15l-6-6-6 6"/>
          </svg>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Таймлайн</span>
          <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 4 }}>{objects.length} объектов · {scene.duration ?? 30}с</span>
          {showTimeline && previewTime != null && (
            <span style={{ fontSize: 10, color: 'var(--a1)', fontVariantNumeric: 'tabular-nums', cursor: 'pointer' }} title="Сбросить маркер" onClick={e => { e.stopPropagation(); setPreviewTime(null); }}>▶ {previewTime.toFixed(1)}с</span>
          )}
          {showTimeline && (
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 'auto', padding: '1px 6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6 }}>
              <button onClick={() => setTimelineZoom(z => Math.max(0.25, z - 0.25))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t2)', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>−</button>
              <span style={{ fontSize: 10, color: 'var(--t2)', minWidth: 28, textAlign: 'center' }}>{Math.round(timelineZoom * 100)}%</span>
              <button onClick={() => setTimelineZoom(z => Math.min(4, z + 0.25))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t2)', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>+</button>
            </div>
          )}
        </div>
        {showTimeline && (
          <SceneTimeline
            objects={objects}
            selectedIds={selectedIds}
            onSelectId={handleTimelineSelect}
            sceneDuration={scene.duration ?? 30}
            updateObjects={updateObjects}
            zoom={timelineZoom}
            previewTime={previewTime}
            onPreviewTime={setPreviewTime}
          />
        )}
      </div>

      {showPicker && <ContentPickerModal onClose={() => setShowPicker(false)} onPick={addObject} />}
      {showUrlModal && <AddByUrlModal onClose={() => setShowUrlModal(false)} onAdd={addObjectByUrl} />}
      {showWidgetPicker && <WidgetPickerModal onClose={() => setShowWidgetPicker(false)} onPick={addWidgetObject} />}
      {showResolution && (
        <ResolutionModal
          current={{ w: canvasW, h: canvasH }}
          onClose={() => setShowResolution(false)}
          onSave={(w, h) => {
            setCanvasW(w);
            setCanvasH(h);
            setScene(prev => ({ ...prev, width: w, height: h }));
            api.updateScene(id, { width: w, height: h }).catch(e => { if (!(e instanceof PermissionError)) console.error(e); });
          }}
        />
      )}

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
    </div>
  );
}
