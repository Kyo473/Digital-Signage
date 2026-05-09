import React, { useEffect, useState, useRef, useSyncExternalStore } from 'react';
import { useAuth } from '../AuthContext';

function subscribeTheme(cb) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => obs.disconnect();
}
function useTheme() {
  return useSyncExternalStore(subscribeTheme, () => document.documentElement.getAttribute('data-theme') || 'dark');
}
import { api, PermissionError } from '../api';
import AccessDenied from '../components/AccessDenied';

const TYPE_LABELS  = { image: 'Изображение', video: 'Видео', webpage: 'Веб-страница', html: 'HTML', pdf: 'PDF' };
const TYPE_SHORT   = { image: 'Фото', video: 'Видео', webpage: 'Веб', html: 'HTML', pdf: 'PDF' };

const THUMB_DARK = {
  video:   { bg: 'radial-gradient(ellipse 80% 70% at 40% 50%, rgba(180,80,255,0.25), rgba(8,9,26,0.9))',  color: '#c97eff' },
  pdf:     { bg: 'radial-gradient(ellipse 80% 70% at 40% 50%, rgba(240,64,112,0.22), rgba(8,9,26,0.9))',  color: '#f04070' },
  webpage: { bg: 'radial-gradient(ellipse 80% 70% at 40% 50%, rgba(34,211,160,0.2),  rgba(8,9,26,0.9))',  color: '#22d3a0' },
  html:    { bg: 'radial-gradient(ellipse 80% 70% at 40% 50%, rgba(240,176,64,0.2),  rgba(8,9,26,0.9))',  color: '#f0b040' },
  image:   { bg: 'radial-gradient(ellipse 80% 70% at 40% 50%, rgba(99,180,255,0.2),  rgba(8,9,26,0.9))',  color: '#7ab8ff' },
};
const THUMB_LIGHT = {
  video:   { bg: 'radial-gradient(ellipse 80% 70% at 40% 50%, rgba(180,80,255,0.18), rgba(230,220,255,0.9))',  color: '#9b4fd4' },
  pdf:     { bg: 'radial-gradient(ellipse 80% 70% at 40% 50%, rgba(240,64,112,0.15), rgba(255,225,230,0.9))',  color: '#d42055' },
  webpage: { bg: 'radial-gradient(ellipse 80% 70% at 40% 50%, rgba(34,211,160,0.2),  rgba(215,248,240,0.9))',  color: '#0fa87a' },
  html:    { bg: 'radial-gradient(ellipse 80% 70% at 40% 50%, rgba(240,176,64,0.2),  rgba(255,245,215,0.9))',  color: '#c07a00' },
  image:   { bg: 'radial-gradient(ellipse 80% 70% at 40% 50%, rgba(99,150,255,0.2),  rgba(220,230,255,0.9))',  color: '#3b6fd4' },
};
const ICONS = {
  video:   <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><polygon points="5 3 19 12 5 21"/></svg>,
  pdf:     <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>,
  webpage: <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  html:    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  image:   <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
};

function X() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>;
}
function DurationField({ value, onChange }) {
  const unlimited = value === 0 || value === '0';
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <input type="number" min="1" value={unlimited ? '' : value} disabled={unlimited}
        onChange={e => onChange(Number(e.target.value))} placeholder="секунды" style={{ flex: 1 }} />
      <label className="checkbox-wrap" style={{ marginBottom: 0, textTransform: 'none', letterSpacing: 0, whiteSpace: 'nowrap' }}>
        <input type="checkbox" checked={unlimited} onChange={e => onChange(e.target.checked ? 0 : 10)} />
        <span className="checkbox-box" />
        ∞ Без лимита
      </label>
    </div>
  );
}
const scrollDurFromSpeed = (speed) => Math.ceil(30 * 850 * (100 / speed) / 1000);
const scrollSpeedFromDur = (sec) => Math.round(30 * 850 * 100 / (sec * 1000));

function ScrollField({ value, onChange, speed, onSpeedChange, name = 'scroll_b' }) {
  const [mode, setMode] = React.useState('speed'); // 'speed' | 'time'
  const [timeInput, setTimeInput] = React.useState(() => String(scrollDurFromSpeed(speed)));

  // Keep timeInput in sync when speed changes externally or mode switches
  React.useEffect(() => {
    if (mode === 'speed') setTimeInput(String(scrollDurFromSpeed(speed)));
  }, [speed, mode]);

  const handleSpeedChange = (v) => {
    onSpeedChange(v);
    setTimeInput(String(scrollDurFromSpeed(v)));
  };

  const handleTimeChange = (raw) => {
    setTimeInput(raw);
    const sec = parseInt(raw, 10);
    if (sec >= 1) onSpeedChange(Math.max(1, Math.min(500, scrollSpeedFromDur(sec))));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 18 }}>
        {[{ v: 'none', l: 'Без прокрутки' }, { v: 'smooth', l: 'Плавная' }].map(o => (
          <label key={o.v} className="radio-wrap" style={{ marginBottom: 0, textTransform: 'none', letterSpacing: 0, color: value === o.v ? 'var(--a1)' : 'var(--t2)' }}>
            <input type="radio" name={name} value={o.v} checked={value === o.v} onChange={() => onChange(o.v)} />
            <span className="radio-box" />
            {o.l}
          </label>
        ))}
      </div>
      {value === 'smooth' && (
        <>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: 'var(--r)', padding: 3 }}>
            {[['speed', 'Скорость %'], ['time', 'Время сек']].map(([m, l]) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                style={{ flex: 1, padding: '4px 8px', borderRadius: 'calc(var(--r) - 2px)', border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: mode === m ? 'var(--a1)' : 'transparent', color: mode === m ? '#fff' : 'var(--t2)' }}>
                {l}
              </button>
            ))}
          </div>

          {mode === 'speed' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="range" min="10" max="500" step="1" value={speed}
                onChange={e => handleSpeedChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--a1)' }} />
              <input type="number" min="10" max="500" step="1" value={speed}
                onChange={e => handleSpeedChange(Math.max(10, Math.min(500, Number(e.target.value))))}
                style={{ width: 60, padding: '4px 6px', fontSize: 13, textAlign: 'right' }} />
              <span style={{ fontSize: 12, color: 'var(--t2)' }}>%</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="number" min="1" step="1" value={timeInput}
                onChange={e => handleTimeChange(e.target.value)}
                style={{ flex: 1, padding: '4px 8px', fontSize: 13 }} />
              <span style={{ fontSize: 12, color: 'var(--t2)', whiteSpace: 'nowrap' }}>сек</span>
              <span style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap' }}>→ {speed}%</span>
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/></svg>
            Длительность в плейлисте:
            <span style={{ color: 'var(--a1)', fontWeight: 700, marginLeft: 2 }}>~{scrollDurFromSpeed(speed)} сек</span>
          </div>
        </>
      )}
    </div>
  );
}

function Modal({ title, onClose, children, footer, width }) {
  const mouseDownTarget = useRef(null);
  return (
    <div className="modal-backdrop"
      onMouseDown={e => { mouseDownTarget.current = e.target; }}
      onMouseUp={e => { if (mouseDownTarget.current === e.currentTarget && e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={width ? { width } : {}}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}><X /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

function AddContentModal({ onClose, onSaved }) {
  const [tab, setTab] = useState('file');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();
  const [fileIsPdf, setFileIsPdf] = useState(false);
  const [fileName, setFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileIsVideo, setFileIsVideo] = useState(false);
  const [fileMuted, setFileMuted] = useState(true);
  const [filePgDur, setFilePgDur] = useState(5);
  const [wpName, setWpName] = useState('');
  const [wpUrl, setWpUrl] = useState('');
  const [wpUser, setWpUser] = useState('');
  const [wpPass, setWpPass] = useState('');
  const [wpScroll, setWpScroll] = useState('none');
  const [wpSpeed, setWpSpeed] = useState(100);
  const [htmlName, setHtmlName] = useState('');
  const [htmlCode, setHtmlCode] = useState('');
  const [htmlScroll, setHtmlScroll] = useState('none');
  const [htmlSpeed, setHtmlSpeed] = useState(100);

  async function submit(e) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      if (tab === 'file') {
        const file = fileRef.current.files[0];
        if (!file) throw new Error('Выберите файл');
        const fd = new FormData();
        fd.append('file', file); fd.append('name', fileName || file.name);
        if (fileIsPdf) fd.append('page_duration', filePgDur);
        if (fileIsVideo) fd.append('muted', fileMuted ? 1 : 0);
        await api.uploadFile(fd);
      } else if (tab === 'webpage') {
        if (!wpName || !wpUrl) throw new Error('Заполните название и URL');
        let url = wpUrl;
        if ((wpUser || wpPass) && !url.includes('@')) {
          const u = new URL(url); u.username = encodeURIComponent(wpUser); u.password = encodeURIComponent(wpPass); url = u.toString();
        }
        await api.addWebpage({ name: wpName, url, scroll_behavior: wpScroll, scroll_speed: wpSpeed });
      } else {
        if (!htmlName || !htmlCode) throw new Error('Заполните поля');
        await api.addHtml({ name: htmlName, html: htmlCode, scroll_behavior: htmlScroll, scroll_speed: htmlSpeed });
      }
      onSaved();
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }

  return (
    <Modal title="Добавить контент" onClose={onClose} width={520}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" form="add-form" type="submit" disabled={loading}>
          {loading ? 'Загрузка...' : 'Добавить'}
        </button>
      </>}>
      <div className="tabs" style={{ marginTop: -4 }}>
        {[{ k: 'file', l: 'Файл / PDF' }, { k: 'webpage', l: 'Веб-страница' }, { k: 'html', l: 'HTML' }].map(t => (
          <button key={t.k} className={`tab${tab === t.k ? ' active' : ''}`} onClick={() => setTab(t.k)}>{t.l}</button>
        ))}
      </div>
      <form id="add-form" onSubmit={submit}>
        {tab === 'file' && <>
          <div className="form-group">
            <label>Файл (фото / видео / PDF)</label>
            <input type="file" ref={fileRef} accept="image/*,video/*,application/pdf,.pdf,.gif,.svg,.bmp,.tiff,.avif,.heic,.webp,.mov,.avi,.mkv,.mpeg"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files[0];
                setSelectedFile(f || null);
                setFileIsPdf(!!(f?.type === 'application/pdf' || f?.name?.endsWith('.pdf')));
                setFileIsVideo(!!(f?.type?.startsWith('video/')));
              }} />
            <div
              onClick={() => fileRef.current.click()}
              style={{
                border: '2px dashed var(--border2)',
                borderRadius: 'var(--r)',
                padding: '24px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
                background: 'var(--glass)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--a1)'; e.currentTarget.style.background = 'rgba(124,92,252,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--glass)'; }}
            >
              {selectedFile ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--a1)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{selectedFile.name}</span>
                </div>
              ) : (
                <>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="1.5" style={{ margin: '0 auto 10px' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Нажмите для выбора файла</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>JPG, PNG, GIF, WebP, SVG, BMP, AVIF · MP4, WebM, MOV, MKV · PDF</div>
                </>
              )}
            </div>
          </div>
          <div className="form-group">
            <label>Название (необязательно)</label>
            <input value={fileName} onChange={e => setFileName(e.target.value)} placeholder="Имя файла" />
          </div>
          {fileIsPdf && (
            <div className="form-group">
              <label>Длительность страницы (сек)</label>
              <DurationField value={filePgDur} onChange={setFilePgDur} />
            </div>
          )}
          {fileIsVideo && (
            <div className="form-group">
              <label>Звук</label>
              <div style={{ display: 'flex', gap: 18 }}>
                {[{ v: true, l: 'Без звука' }, { v: false, l: 'Со звуком' }].map(o => (
                  <label key={String(o.v)} className="radio-wrap" style={{ marginBottom: 0, textTransform: 'none', letterSpacing: 0, color: fileMuted === o.v ? 'var(--a1)' : 'var(--t2)' }}>
                    <input type="radio" name="file_muted" checked={fileMuted === o.v} onChange={() => setFileMuted(o.v)} />
                    <span className="radio-box" />
                    {o.l}
                  </label>
                ))}
              </div>
            </div>
          )}
        </>}
        {tab === 'webpage' && <>
          <div className="form-group">
            <label>Название</label>
            <input value={wpName} onChange={e => setWpName(e.target.value)} placeholder="Сайт компании" required />
          </div>
          <div className="form-group">
            <label>URL</label>
            <input value={wpUrl} onChange={e => setWpUrl(e.target.value)} placeholder="https://example.com" required />
          </div>
          <div className="form-hint">
            <div className="form-hint-label">Basic Auth — необязательно</div>
            <div className="form-row">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Логин</label>
                <input value={wpUser} onChange={e => setWpUser(e.target.value)} placeholder="user" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Пароль</label>
                <input type="password" value={wpPass} onChange={e => setWpPass(e.target.value)} placeholder="••••" />
              </div>
            </div>
          </div>
          <div className="form-group">
            <label>Прокрутка страницы</label>
            <ScrollField value={wpScroll} onChange={setWpScroll} speed={wpSpeed} onSpeedChange={setWpSpeed} />
          </div>
        </>}
        {tab === 'html' && <>
          <div className="form-group">
            <label>Название</label>
            <input value={htmlName} onChange={e => setHtmlName(e.target.value)} placeholder="Моя страница" required />
          </div>
          <div className="form-group">
            <label>HTML / CSS / JS</label>
            <textarea value={htmlCode} onChange={e => setHtmlCode(e.target.value)}
              placeholder={'<!DOCTYPE html>\n<html>\n  <body>\n    <h1>Hello!</h1>\n  </body>\n</html>'}
              style={{ minHeight: 180, fontFamily: 'monospace', fontSize: 12 }} required />
          </div>
          <div className="form-group">
            <label>Прокрутка страницы</label>
            <ScrollField value={htmlScroll} onChange={setHtmlScroll} speed={htmlSpeed} onSpeedChange={setHtmlSpeed} name="scroll_html" />
          </div>
        </>}
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>{error}</div>}
      </form>
    </Modal>
  );
}

function EditContentModal({ item, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState(item.name);
  const [pageDuration, setPageDuration] = useState(item.page_duration ?? 5);
  const [scrollBehavior, setScrollBehavior] = useState(item.scroll_behavior ?? 'none');
  const [scrollSpeed, setScrollSpeed] = useState(item.scroll_speed ?? 100);
  const [htmlScroll, setHtmlScroll] = useState(item.type === 'html' ? (item.scroll_behavior ?? 'none') : 'none');
  const [htmlSpeed, setHtmlSpeed] = useState(item.type === 'html' ? (item.scroll_speed ?? 100) : 100);
  const [html, setHtml] = useState(item.html || '');
  const [muted, setMuted] = useState(item.muted !== 0);
  const [wpUser, setWpUser] = useState('');
  const [wpPass, setWpPass] = useState('');
  const [wpUrlClean, setWpUrlClean] = useState('');

  useEffect(() => {
    if (item.type === 'webpage' && item.url) {
      try {
        const u = new URL(item.url);
        setWpUser(decodeURIComponent(u.username)); setWpPass(decodeURIComponent(u.password));
        u.username = ''; u.password = ''; setWpUrlClean(u.toString());
      } catch { setWpUrlClean(item.url); }
    }
  }, [item]);

  async function submit(e) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const patch = { name };
      if (item.type === 'video') patch.muted = muted ? 1 : 0;
      if (item.type === 'webpage') {
        let finalUrl = wpUrlClean;
        if ((wpUser || wpPass) && !finalUrl.includes('@')) {
          const u = new URL(finalUrl); u.username = encodeURIComponent(wpUser); u.password = encodeURIComponent(wpPass); finalUrl = u.toString();
        }
        patch.url = finalUrl; patch.scroll_behavior = scrollBehavior; patch.scroll_speed = scrollSpeed;
      } else if (item.type === 'html') {
        patch.html = html;
        patch.scroll_behavior = htmlScroll;
        patch.scroll_speed = htmlSpeed;
      }
      else if (item.type === 'pdf') patch.page_duration = pageDuration;
      await api.updateContent(item.id, patch); onSaved();
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }

  return (
    <Modal title={`${TYPE_LABELS[item.type]} — редактировать`} onClose={onClose} width={520}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" form="edit-form" type="submit" disabled={loading}>
          {loading ? 'Сохранение...' : 'Сохранить'}
        </button>
      </>}>
      <form id="edit-form" onSubmit={submit}>
        <div className="form-group">
          <label>Название</label>
          <input value={name} onChange={e => setName(e.target.value)} required />
        </div>
        {item.type === 'webpage' && <>
          <div className="form-group">
            <label>URL</label>
            <input value={wpUrlClean} onChange={e => setWpUrlClean(e.target.value)} required />
          </div>
          <div className="form-hint">
            <div className="form-hint-label">Basic Auth</div>
            <div className="form-row">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Логин</label>
                <input value={wpUser} onChange={e => setWpUser(e.target.value)} placeholder="user" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Пароль</label>
                <input type="password" value={wpPass} onChange={e => setWpPass(e.target.value)} placeholder="••••" />
              </div>
            </div>
          </div>
          <div className="form-group">
            <label>Прокрутка</label>
            <ScrollField value={scrollBehavior} onChange={setScrollBehavior} speed={scrollSpeed} onSpeedChange={setScrollSpeed} />
          </div>
        </>}
        {item.type === 'html' && <>
          <div className="form-group">
            <label>HTML / CSS / JS</label>
            <textarea value={html} onChange={e => setHtml(e.target.value)} style={{ minHeight: 200, fontFamily: 'monospace', fontSize: 12 }} required />
          </div>
          <div className="form-group">
            <label>Прокрутка страницы</label>
            <ScrollField value={htmlScroll} onChange={setHtmlScroll} speed={htmlSpeed} onSpeedChange={setHtmlSpeed} name="scroll_html_edit" />
          </div>
        </>}
        {item.type === 'pdf' && <div className="form-group">
          <label>Длительность страницы (сек)</label>
          <DurationField value={pageDuration} onChange={setPageDuration} />
        </div>}
        {item.type === 'video' && (
          <div className="form-group">
            <label>Звук</label>
            <div style={{ display: 'flex', gap: 18 }}>
              {[{ v: true, l: 'Без звука' }, { v: false, l: 'Со звуком' }].map(o => (
                <label key={String(o.v)} className="radio-wrap" style={{ marginBottom: 0, textTransform: 'none', letterSpacing: 0, color: muted === o.v ? 'var(--a1)' : 'var(--t2)' }}>
                  <input type="radio" name="edit_muted" checked={muted === o.v} onChange={() => setMuted(o.v)} />
                  <span className="radio-box" />
                  {o.l}
                </label>
              ))}
            </div>
          </div>
        )}
        {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
      </form>
    </Modal>
  );
}

function VideoThumb({ url }) {
  const videoRef = React.useRef(null);
  const [hovered, setHovered] = React.useState(false);

  const handleEnter = () => {
    setHovered(true);
    const v = videoRef.current;
    if (v) { v.currentTime = 0; v.play().catch(() => {}); }
  };
  const handleLeave = () => {
    setHovered(false);
    const v = videoRef.current;
    if (v) { v.pause(); v.currentTime = 0; }
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
      onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <video
        ref={videoRef}
        src={url}
        muted
        playsInline
        preload="metadata"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {!hovered && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.3)',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none">
              <polygon points="5 3 19 12 5 21"/>
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

function Thumb({ item }) {
  const theme = useTheme();
  const palette = theme === 'light' ? THUMB_LIGHT : THUMB_DARK;
  const t = palette[item.type];
  if (item.type === 'image' && item.url)
    return <img src={item.url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  if (item.type === 'video' && item.url)
    return <VideoThumb url={item.url} />;
  return (
    <div className="c-card-thumb-inner" style={{ background: t?.bg, color: t?.color }}>
      {ICONS[item.type]}
    </div>
  );
}

export default function ContentPage() {
  const { hasPerm } = useAuth();
  const [items, setItems] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [denied, setDenied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await api.getContent());
    } catch (e) {
      if (e instanceof PermissionError) { setDenied(true); return; }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  async function del(id) {
    if (!window.confirm('Удалить контент?')) return;
    try { await api.deleteContent(id); load(); }
    catch (e) { if (!(e instanceof PermissionError)) console.error(e); }
  }

  const types = ['all', ...new Set(items.map(i => i.type))];
  const visible = filter === 'all' ? items : items.filter(i => i.type === filter);

  if (denied) return <AccessDenied />;

  return (
    <div>
      {/* Stats */}
      {!loading && items.length > 0 && (
        <div className="stats-strip">
          {[
            { v: items.length, l: 'Всего файлов', cl: '' },
            { v: items.filter(i => i.type === 'image').length, l: 'Изображений', cl: '' },
            { v: items.filter(i => i.type === 'video').length, l: 'Видео', cl: '' },
            { v: items.filter(i => ['webpage','html'].includes(i.type)).length, l: 'Веб / HTML', cl: 'stat-accent' },
          ].map(({ v, l, cl }) => (
            <div key={l} className="stat-card">
              <div className={`stat-value ${cl}`}>{v}</div>
              <div className="stat-label">{l}</div>
            </div>
          ))}
        </div>
      )}

      <div className="page-header">
        <div className="page-title-row">
          <div className="page-title">Контент</div>
          <div className="page-sub">{loading ? '...' : `${items.length} элементов в библиотеке`}</div>
        </div>
        {hasPerm('content.create') && (
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Добавить
          </button>
        )}
      </div>

      {/* Type filter pills */}
      {items.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {types.map(t => (
            <button key={t} onClick={() => setFilter(t)} style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              border: '1px solid',
              cursor: 'pointer', transition: 'all 0.15s',
              background: filter === t ? 'rgba(124,92,252,0.18)' : 'var(--glass)',
              color: filter === t ? 'var(--a1)' : 'var(--t2)',
              borderColor: filter === t ? 'rgba(124,92,252,0.4)' : 'var(--border)',
              backdropFilter: 'blur(8px)',
            }}>
              {t === 'all' ? 'Все' : TYPE_LABELS[t] ?? t}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--t3)', padding: '64px 0', textAlign: 'center' }}>Загрузка...</div>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
          </svg>
          <strong>Библиотека пуста</strong>
          <p>Добавьте изображение, видео, PDF или веб-страницу</p>
        </div>
      ) : (
        <div className="content-grid">
          {visible.map(item => (
            <div key={item.id} className="c-card">
              <div className="c-card-thumb">
                <Thumb item={item} />
                <div className="c-card-badge">
                  <span className={`tag tag-${item.type}`}>{TYPE_SHORT[item.type]}</span>
                </div>
              </div>
              <div className="c-card-body">
                <div className="c-card-name">{item.name}</div>
                <div className="c-card-meta">
                  {item.type === 'pdf' && (
                    <span>{item.page_duration || '∞'} с/стр</span>
                  )}
                  {['webpage', 'html'].includes(item.type) && item.scroll_behavior === 'smooth' && (
                    <span style={{ color: 'var(--green)', fontSize: 10, fontWeight: 700 }}>↕ {item.scroll_speed ?? 100}%</span>
                  )}
                </div>
                <div className="c-card-actions">
                  {(hasPerm('content.edit_any') || hasPerm('content.edit_own')) && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditItem(item)}>Изменить</button>
                  )}
                  {(hasPerm('content.delete_any') || hasPerm('content.delete_own')) && (
                    <button className="btn btn-danger btn-sm" onClick={() => del(item.id)}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddContentModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {editItem && <EditContentModal item={editItem} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); load(); }} />}
    </div>
  );
}
