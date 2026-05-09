import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import { api } from '../api';
import './PlayerPage.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.js`;

// ── Logging ───────────────────────────────────────────────────────────────────

const MAX_LOGS = 100;
let _logListeners = [];
const logStore = [];

function addLog(level, msg, detail = '') {
  const entry = {
    ts: new Date().toLocaleTimeString('ru', { hour12: false, fractionalSecondDigits: 2 }),
    level,
    msg,
    detail,
  };
  logStore.push(entry);
  if (logStore.length > MAX_LOGS) logStore.shift();
  _logListeners.forEach(fn => fn([...logStore]));
  if (level === 'error') console.error(`[DS] ${msg}`, detail);
  else console.log(`[DS] [${level}] ${msg}`, detail || '');
}

function useLog() {
  const [logs, setLogs] = useState([...logStore]);
  useEffect(() => {
    _logListeners.push(setLogs);
    return () => { _logListeners = _logListeners.filter(f => f !== setLogs); };
  }, []);
  return logs;
}

// ── URL helpers ───────────────────────────────────────────────────────────────

// Always route through backend proxy so the server strips X-Frame-Options/CSP
// and injects Basic Auth credentials server-side (works on plain HTTP too).
function buildProxySrc(url) {
  try {
    const u = new URL(url);
    let auth = '';
    if (u.username || u.password) {
      auth = btoa(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`);
      u.username = '';
      u.password = '';
    }
    const params = new URLSearchParams({ url: u.toString() });
    if (auth) params.set('auth', auth);
    return `/api/proxy?${params}`;
  } catch {
    return `/api/proxy?url=${encodeURIComponent(url)}`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scrollSpeedToDuration(speed) {
  return Math.ceil(30 * 850 * (100 / speed) / 1000);
}

function getSceneObjDuration(obj) {
  const behavior = obj.props?.scroll_behavior ?? obj.scroll_behavior;
  if ((obj.type === 'webpage' || obj.type === 'html') && behavior === 'smooth')
    return scrollSpeedToDuration(obj.props?.scroll_speed ?? obj.scroll_speed ?? 100);
  return obj.obj_duration ?? 10;
}

// ── Slide components ──────────────────────────────────────────────────────────

function SlideWebpage({ item, onAdvance, duration, paused }) {
  const src = buildProxySrc(item.url);
  const [blocked, setBlocked] = useState(false);
  const iframeRef = useRef();
  const scrollRafRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const scrollPosRef = useRef(0);
  const scrollStartTimeRef = useRef(0);
  const scrollElapsedRef = useRef(0);

  const stopScroll = useCallback(() => {
    if (scrollRafRef.current) { cancelAnimationFrame(scrollRafRef.current); scrollRafRef.current = null; }
    if (scrollTimerRef.current) { clearTimeout(scrollTimerRef.current); scrollTimerRef.current = null; }
  }, []);

  useEffect(() => {
    addLog('info', `Показ веб-страницы: ${item.name}`, item.url);
    setBlocked(false);
    stopScroll();
    return stopScroll;
  }, [item.url, item.name, stopScroll]);

  const runScrollRef = useRef(null);

  const handleLoad = useCallback(() => {
    addLog('info', `Веб-страница загружена`, item.url);
    stopScroll();
    scrollElapsedRef.current = 0;

    if (item.scroll_behavior !== 'smooth') return;

    scrollTimerRef.current = setTimeout(() => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;

      const durationMs = (duration > 0 ? duration : 30) * 1000;

      const getMaxScroll = () => {
        try {
          return Math.max(win.document.body.scrollHeight, win.document.documentElement.scrollHeight) - win.innerHeight;
        } catch { return 0; }
      };

      const runScroll = (startElapsed = 0) => {
        const startTime = performance.now();
        const step = (now) => {
          const elapsed = startElapsed + (now - startTime);
          scrollElapsedRef.current = elapsed;
          const maxScroll = getMaxScroll();
          if (maxScroll > 0) {
            const t = Math.min(elapsed / durationMs, 1);
            try { win.scrollTo(0, t * maxScroll); } catch {}
          }
          if (elapsed < durationMs) {
            scrollRafRef.current = requestAnimationFrame(step);
          } else {
            scrollTimerRef.current = setTimeout(() => {
              try { win.scrollTo(0, 0); } catch {}
              scrollElapsedRef.current = 0;
              scrollTimerRef.current = setTimeout(() => runScroll(0), 500);
            }, 1000);
          }
        };
        scrollRafRef.current = requestAnimationFrame(step);
      };

      runScrollRef.current = runScroll;
      runScroll(0);
      addLog('info', 'Скролл запущен', `${duration}s / max=${getMaxScroll()}px`);
    }, 1500);
  }, [item.url, item.scroll_behavior, duration, stopScroll]);

  // Pause / resume scroll
  useEffect(() => {
    if (!runScrollRef.current) return;
    if (paused) {
      stopScroll();
    } else {
      runScrollRef.current(scrollElapsedRef.current);
    }
  }, [paused, stopScroll]);

  const handleError = useCallback(() => {
    addLog('error', `Ошибка загрузки iframe`, item.url);
    setBlocked(true);
  }, [item.url]);

  if (blocked) {
    return (
      <div className="slide-blocked">
        <div className="slide-blocked-icon">🚫</div>
        <div className="slide-blocked-title">Сайт недоступен в iframe</div>
        <div className="slide-blocked-url">{item.url}</div>
        <div className="slide-blocked-hint">
          Сайт запрещает встраивание через X-Frame-Options или CSP.<br />
          Используйте HTML-сниппет или загрузите скриншот вместо URL.
        </div>
        <button className="btn-next" onClick={onAdvance}>→ Следующий слайд</button>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={item.name}
      className="player-iframe"
      onLoad={handleLoad}
      onError={handleError}
    />
  );
}

function SlideHtml({ item, duration, paused }) {
  const srcRef = useRef(null);
  const iframeRef = useRef();
  const scrollRafRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const scrollElapsedRef = useRef(0);
  const runScrollRef = useRef(null);

  if (!srcRef.current) {
    const blob = new Blob([item.html], { type: 'text/html' });
    srcRef.current = URL.createObjectURL(blob);
  }

  const stopScroll = useCallback(() => {
    if (scrollRafRef.current) { cancelAnimationFrame(scrollRafRef.current); scrollRafRef.current = null; }
    if (scrollTimerRef.current) { clearTimeout(scrollTimerRef.current); scrollTimerRef.current = null; }
  }, []);

  useEffect(() => {
    addLog('info', `Показ HTML-слайда: ${item.name}`);
    stopScroll();
    return () => {
      stopScroll();
      URL.revokeObjectURL(srcRef.current);
      srcRef.current = null;
    };
  }, [item.name, stopScroll]);

  const handleLoad = useCallback(() => {
    stopScroll();
    scrollElapsedRef.current = 0;
    if (item.scroll_behavior !== 'smooth') return;

    scrollTimerRef.current = setTimeout(() => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;

      const durationMs = (duration > 0 ? duration : 30) * 1000;

      const getMaxScroll = () => {
        try {
          return Math.max(win.document.body.scrollHeight, win.document.documentElement.scrollHeight) - win.innerHeight;
        } catch { return 0; }
      };

      const runScroll = (startElapsed = 0) => {
        const startTime = performance.now();
        const step = (now) => {
          const elapsed = startElapsed + (now - startTime);
          scrollElapsedRef.current = elapsed;
          const maxScroll = getMaxScroll();
          if (maxScroll > 0) {
            const t = Math.min(elapsed / durationMs, 1);
            try { win.scrollTo(0, t * maxScroll); } catch {}
          }
          if (elapsed < durationMs) {
            scrollRafRef.current = requestAnimationFrame(step);
          } else {
            scrollTimerRef.current = setTimeout(() => {
              try { win.scrollTo(0, 0); } catch {}
              scrollElapsedRef.current = 0;
              scrollTimerRef.current = setTimeout(() => runScroll(0), 500);
            }, 1000);
          }
        };
        scrollRafRef.current = requestAnimationFrame(step);
      };

      runScrollRef.current = runScroll;
      runScroll(0);
      addLog('info', 'HTML скролл запущен', `${duration}s / max=${getMaxScroll()}px`);
    }, 1500);
  }, [item.scroll_behavior, duration, stopScroll]);

  useEffect(() => {
    if (!runScrollRef.current) return;
    if (paused) {
      stopScroll();
    } else {
      runScrollRef.current(scrollElapsedRef.current);
    }
  }, [paused, stopScroll]);

  return (
    <iframe
      ref={iframeRef}
      src={srcRef.current}
      title={item.name}
      className="player-iframe"
      sandbox="allow-scripts allow-same-origin"
      onLoad={handleLoad}
    />
  );
}

function SlideImage({ item }) {
  useEffect(() => { addLog('info', `Показ изображения: ${item.name}`, item.url); }, [item.name, item.url]);
  return <img src={item.url} alt={item.name} className="player-media" />;
}

function SlideVideo({ item, onEnded, paused }) {
  const wantSound = item.muted === 0;
  const videoRef = useRef();
  const timerRef = useRef();
  const onEndedRef = useRef(onEnded);
  const timerStartRef = useRef(0);
  const remainingRef = useRef(0);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  const durationOverride = item.duration_override ?? item.duration ?? 0;

  const startTimer = (ms) => {
    clearTimeout(timerRef.current);
    remainingRef.current = ms;
    timerStartRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      addLog('info', `Видео: истекло время (${durationOverride}s): ${item.name}`);
      onEndedRef.current();
    }, ms);
  };

  useEffect(() => {
    addLog('info', `Показ видео: ${item.name}`, item.url);
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    remainingRef.current = 0;
    video.play().catch(() => addLog('warn', 'Autoplay заблокирован браузером', item.name));

    if (durationOverride > 0) startTimer(durationOverride * 1000);

    return () => clearTimeout(timerRef.current);
  }, [item.url, durationOverride]); // eslint-disable-line

  // Pause / resume video + pause/resume duration timer
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) {
      video.pause();
      if (remainingRef.current > 0) {
        clearTimeout(timerRef.current);
        remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - timerStartRef.current));
      }
    } else {
      video.play().catch(() => {});
      if (remainingRef.current > 0) startTimer(remainingRef.current);
    }
  }, [paused]); // eslint-disable-line

  // After user taps the overlay — unmute if content has sound enabled
  useEffect(() => {
    const handler = () => {
      const video = videoRef.current;
      if (!video || !wantSound) return;
      video.muted = false;
      video.play().catch(() => {});
    };
    document.addEventListener('player-interaction', handler);
    return () => document.removeEventListener('player-interaction', handler);
  }, [wantSound]);

  return (
    <video
      ref={videoRef}
      src={item.url}
      className="player-media"
      playsInline
      onEnded={() => { addLog('info', `Видео завершено: ${item.name}`); onEnded(); }}
      onError={() => { addLog('error', `Ошибка воспроизведения видео: ${item.name}`); onEnded(); }}
    />
  );
}

function SlidePdf({ item, onEnded, paused }) {
  const canvasRef = useRef();
  const [pageNum, setPageNum] = useState(0); // 0 = not loaded yet
  const [totalPages, setTotalPages] = useState(0);
  const pdfRef = useRef(null);
  const pageDur = (item.page_duration ?? 5) * 1000;
  const timerRef = useRef(null);
  const pausedRef = useRef(paused);
  const onEndedRef = useRef(onEnded);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  // Load PDF
  useEffect(() => {
    addLog('info', `Показ PDF: ${item.name}`, item.url);
    let cancelled = false;
    clearTimeout(timerRef.current);
    setPageNum(0);
    setTotalPages(0);
    pdfRef.current = null;

    pdfjsLib.getDocument(item.url).promise.then(pdf => {
      if (cancelled) return;
      pdfRef.current = pdf;
      setTotalPages(pdf.numPages);
      setPageNum(1); // triggers render + timer
    }).catch(e => {
      addLog('error', `Ошибка загрузки PDF: ${item.name}`, e.message);
    });

    return () => { cancelled = true; clearTimeout(timerRef.current); };
  }, [item.url, item.name]);

  // Render current page onto canvas
  useEffect(() => {
    if (!pdfRef.current || pageNum < 1) return;
    let cancelled = false;

    pdfRef.current.getPage(pageNum).then(page => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const container = canvas.parentElement;
      const cw = container.clientWidth || window.innerWidth;
      const ch = container.clientHeight || window.innerHeight;
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(cw / viewport.width, ch / viewport.height);
      const scaled = page.getViewport({ scale });
      canvas.width = scaled.width;
      canvas.height = scaled.height;
      page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled });
      addLog('info', `PDF стр. ${pageNum}/${pdfRef.current.numPages}`);
    });

    return () => { cancelled = true; };
  }, [pageNum]);

  // Page-advance timer — starts only after load, respects pause
  useEffect(() => {
    if (pageNum < 1 || totalPages === 0 || pageDur === 0) return;
    clearTimeout(timerRef.current);

    const schedule = () => {
      timerRef.current = setTimeout(() => {
        if (pausedRef.current) return; // don't advance while paused
        if (pageNum < totalPages) {
          setPageNum(pageNum + 1);
        } else {
          if (onEndedRef.current) onEndedRef.current();
        }
      }, pageDur);
    };

    if (!paused) schedule();
    return () => clearTimeout(timerRef.current);
  }, [pageNum, totalPages, pageDur, paused]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '100%' }} />
      {totalPages > 1 && (
        <div style={{ position: 'absolute', bottom: 12, right: 16, fontSize: 12, color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }}>
          {pageNum} / {totalPages}
        </div>
      )}
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ duration, running }) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());
  const rafRef = useRef();

  useEffect(() => {
    startRef.current = Date.now();
    setProgress(0);
    if (!running || !duration) return; // duration=0 means unlimited
    const tick = () => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      setProgress(Math.min(elapsed / duration, 1));
      if (elapsed < duration) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [duration, running]);

  return (
    <div className="progress-bar">
      <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
    </div>
  );
}

// ── Log overlay ───────────────────────────────────────────────────────────────

function LogOverlay({ onClose }) {
  const logs = useLog();
  const bottomRef = useRef();
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  return (
    <div className="log-overlay">
      <div className="log-header">
        <span>Журнал событий</span>
        <button onClick={onClose} className="log-close">✕</button>
      </div>
      <div className="log-body">
        {logs.length === 0 && <div className="log-empty">Нет событий</div>}
        {logs.map((l, i) => (
          <div key={i} className={`log-line log-${l.level}`}>
            <span className="log-ts">{l.ts}</span>
            <span className="log-msg">{l.msg}</span>
            {l.detail && <span className="log-detail">{l.detail}</span>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Slide info overlay ────────────────────────────────────────────────────────

function SlideInfo({ item, total, idx }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(t);
  }, [item.id]);

  return (
    <div className={`slide-info ${visible ? 'visible' : ''}`}>
      <span>{item.name}</span>
      <span>{idx + 1} / {total}</span>
    </div>
  );
}

// ── Slide Scene ───────────────────────────────────────────────────────────────

function SceneObjectScrollable({ style, obj, src, paused }) {
  const iframeRef = useRef();
  const scrollRafRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const scrollElapsedRef = useRef(0);
  const runScrollRef = useRef(null);
  const scrollBehavior = obj.props?.scroll_behavior ?? obj.scroll_behavior ?? 'none';
  const scrollSpeed = obj.props?.scroll_speed ?? obj.scroll_speed ?? 100;
  const duration = getSceneObjDuration(obj);

  const stopScroll = useCallback(() => {
    if (scrollRafRef.current) { cancelAnimationFrame(scrollRafRef.current); scrollRafRef.current = null; }
    if (scrollTimerRef.current) { clearTimeout(scrollTimerRef.current); scrollTimerRef.current = null; }
  }, []);

  useEffect(() => () => stopScroll(), [stopScroll]);

  const handleLoad = useCallback(() => {
    stopScroll();
    scrollElapsedRef.current = 0;
    if (scrollBehavior !== 'smooth') return;

    scrollTimerRef.current = setTimeout(() => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;

      const durationMs = (duration > 0 ? duration : 30) * 1000;

      const getMaxScroll = () => {
        try {
          return Math.max(win.document.body.scrollHeight, win.document.documentElement.scrollHeight) - win.innerHeight;
        } catch { return 0; }
      };

      const runScroll = (startElapsed = 0) => {
        const startTime = performance.now();
        const step = (now) => {
          const elapsed = startElapsed + (now - startTime);
          scrollElapsedRef.current = elapsed;
          const maxScroll = getMaxScroll();
          if (maxScroll > 0) {
            const t = Math.min(elapsed / durationMs, 1);
            try { win.scrollTo(0, t * maxScroll); } catch {}
          }
          if (elapsed < durationMs) {
            scrollRafRef.current = requestAnimationFrame(step);
          } else {
            scrollTimerRef.current = setTimeout(() => {
              try { win.scrollTo(0, 0); } catch {}
              scrollElapsedRef.current = 0;
              scrollTimerRef.current = setTimeout(() => runScroll(0), 500);
            }, 1000);
          }
        };
        scrollRafRef.current = requestAnimationFrame(step);
      };

      runScrollRef.current = runScroll;
      runScroll(0);
    }, 1500);
  }, [scrollBehavior, scrollSpeed, duration, stopScroll]);

  useEffect(() => {
    if (!runScrollRef.current) return;
    if (paused) {
      stopScroll();
    } else {
      runScrollRef.current(scrollElapsedRef.current);
    }
  }, [paused, stopScroll]);

  return (
    <div style={style}>
      <iframe
        ref={iframeRef}
        src={src}
        style={{ width: '100%', height: '100%', border: 'none' }}
        title={obj.name}
        sandbox="allow-scripts allow-same-origin"
        onLoad={handleLoad}
      />
    </div>
  );
}

function SceneObjectVideo({ style, obj, paused }) {
  const wantSound = obj.muted !== 1;
  const videoRef = useRef();
  const src = obj.url.startsWith('/uploads/') ? obj.url : `/api/proxy?url=${encodeURIComponent(obj.url)}`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.play().catch(() => {});
  }, [src]);

  useEffect(() => {
    const handler = () => {
      const video = videoRef.current;
      if (!video || !wantSound) return;
      video.muted = false;
      video.play().catch(() => {});
    };
    document.addEventListener('player-interaction', handler);
    return () => document.removeEventListener('player-interaction', handler);
  }, [wantSound]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) video.pause();
    else video.play().catch(() => {});
  }, [paused]);

  return (
    <div style={style}>
      <video ref={videoRef} src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loop playsInline />
    </div>
  );
}

function SceneObjectHtml({ style, obj, paused }) {
  const srcRef = useRef(null);
  if (!srcRef.current) {
    const blob = new Blob([obj.html], { type: 'text/html' });
    srcRef.current = URL.createObjectURL(blob);
  }
  return <SceneObjectScrollable style={style} obj={obj} src={srcRef.current} paused={paused} />;
}

function SceneObjectPdf({ style, obj, paused }) {
  const canvasRef = useRef(null);
  const pdfRef = useRef(null);
  const timerRef = useRef(null);
  const [pageNum, setPageNum] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const pageDur = (obj.page_duration ?? 5) * 1000;

  useEffect(() => {
    let cancelled = false;
    pdfjsLib.getDocument(obj.url).promise.then(pdf => {
      if (cancelled) return;
      pdfRef.current = pdf;
      setTotalPages(pdf.numPages);
      setPageNum(1);
    }).catch(() => {});
    return () => { cancelled = true; clearTimeout(timerRef.current); };
  }, [obj.url]);

  useEffect(() => {
    if (!pdfRef.current || pageNum < 1) return;
    let cancelled = false;
    pdfRef.current.getPage(pageNum).then(page => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const container = canvas.parentElement;
      const cw = container.clientWidth || 960;
      const ch = container.clientHeight || 540;
      const vp = page.getViewport({ scale: 1 });
      const scale = Math.min(cw / vp.width, ch / vp.height);
      const scaled = page.getViewport({ scale });
      canvas.width = scaled.width;
      canvas.height = scaled.height;
      page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled });
    });
    return () => { cancelled = true; };
  }, [pageNum]);

  useEffect(() => {
    if (pageNum < 1 || totalPages === 0 || pageDur === 0 || paused) {
      clearTimeout(timerRef.current);
      return;
    }
    timerRef.current = setTimeout(() => {
      setPageNum(n => n < totalPages ? n + 1 : 1);
    }, pageDur);
    return () => clearTimeout(timerRef.current);
  }, [pageNum, totalPages, pageDur, paused]);

  return (
    <div style={{ ...style, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

function SceneObject({ obj, sceneW, sceneH, visible = true, opacity = 1, transition = 'none', paused = false }) {
  const W = sceneW || 1920;
  const H = sceneH || 1080;
  const style = {
    position: 'absolute',
    left: `${(obj.x / W) * 100}%`,
    top: `${(obj.y / H) * 100}%`,
    width: `${(obj.w / W) * 100}%`,
    height: `${(obj.h / H) * 100}%`,
    zIndex: obj.z ?? 0,
    overflow: 'hidden',
    opacity,
    transition,
    pointerEvents: visible ? 'auto' : 'none',
  };

  if (obj.type === 'image' && obj.url) {
    if (!visible && opacity === 0) return null;
    const src = obj.url.startsWith('/uploads/') ? obj.url : `/api/proxy?url=${encodeURIComponent(obj.url)}`;
    return <div style={style}><img src={src} alt={obj.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>;
  }
  if (obj.type === 'video' && obj.url) {
    if (!visible && opacity === 0) return null;
    return <SceneObjectVideo style={style} obj={obj} paused={paused} />;
  }
  if (obj.type === 'webpage' && obj.url) {
    return <SceneObjectScrollable style={style} obj={obj} src={`/api/proxy?url=${encodeURIComponent(obj.url)}`} paused={paused} />;
  }
  if (obj.type === 'html' && obj.html) {
    return <SceneObjectHtml style={style} obj={obj} paused={paused} />;
  }
  if (obj.type === 'pdf' && obj.url) {
    return <SceneObjectPdf style={style} obj={obj} paused={paused} />;
  }
  if (obj.type === 'widget' && obj.url) {
    return (
      <div style={style}>
        <iframe src={obj.url} style={{ width: '100%', height: '100%', border: 'none' }} title={obj.name} />
      </div>
    );
  }
  if (obj.type === 'text') {
    const p = obj.props || {};
    const bg = p.bgColor && p.bgOpacity > 0
      ? p.bgColor + Math.round((p.bgOpacity / 100) * 255).toString(16).padStart(2, '0')
      : 'transparent';
    return (
      <div style={{
        ...style,
        display: 'flex',
        alignItems: p.valign === 'top' ? 'flex-start' : p.valign === 'bottom' ? 'flex-end' : 'center',
        justifyContent: p.align === 'left' ? 'flex-start' : p.align === 'right' ? 'flex-end' : 'center',
        background: bg,
        padding: 8,
        boxSizing: 'border-box',
      }}>
        <div style={{
          fontFamily: p.fontFamily || 'Inter, sans-serif',
          fontSize: p.fontSize || 48,
          color: p.color || '#ffffff',
          fontWeight: p.bold ? 700 : 400,
          fontStyle: p.italic ? 'italic' : 'normal',
          lineHeight: p.lineHeight || 1.2,
          textAlign: p.align || 'center',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>{p.text || ''}</div>
      </div>
    );
  }
  return null;
}

function SlideScene({ item, onEnded, paused }) {
  useEffect(() => { addLog('info', `Показ сцены: ${item.name}`); }, [item.name]);
  const objects = item.scene_objects || [];
  const sceneW = item.scene_width || 1920;
  const sceneH = item.scene_height || 1080;
  const sceneDuration = item.scene_duration ?? item.duration ?? 30;

  const [sceneTime, setSceneTime] = useState(0);
  const onEndedRef = useRef(onEnded);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  // scene clock — pauses when paused prop is true
  const sceneTimeRef = useRef(0);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    sceneTimeRef.current = 0;
    setSceneTime(0);
    let lastTs = Date.now();
    const interval = setInterval(() => {
      if (pausedRef.current) { lastTs = Date.now(); return; }
      const now = Date.now();
      sceneTimeRef.current += (now - lastTs) / 1000;
      lastTs = now;
      if (sceneDuration > 0 && sceneTimeRef.current >= sceneDuration) {
        sceneTimeRef.current = 0;
      }
      setSceneTime(sceneTimeRef.current);
    }, 100);
    return () => clearInterval(interval);
  }, [item.id, sceneDuration]); // eslint-disable-line

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000', overflow: 'hidden' }}>
      {objects.map(obj => {
        const objStart = obj.obj_start_time ?? 0;
        const objDuration = getSceneObjDuration(obj);
        const objEnd = objStart + objDuration;
        const visible = sceneTime >= objStart && sceneTime < objEnd;

        let opacity = visible ? 1 : 0;
        let transition = 'none';

        if (obj.transition_in === 'fade' && visible) {
          const fadeProgress = Math.min((sceneTime - objStart) / 0.5, 1);
          opacity = fadeProgress;
          transition = 'opacity 0.5s';
        }
        if (obj.transition_out === 'fade' && visible) {
          const timeLeft = objEnd - sceneTime;
          if (timeLeft < 0.5) {
            opacity = Math.max(0, timeLeft / 0.5);
            transition = 'opacity 0.5s';
          }
        }

        return (
          <SceneObject
            key={obj.id}
            obj={obj}
            sceneW={sceneW}
            sceneH={sceneH}
            visible={visible}
            opacity={opacity}
            transition={transition}
            paused={paused}
          />
        );
      })}
    </div>
  );
}

// ── Main player ───────────────────────────────────────────────────────────────

export default function PlayerPage() {
  const { screenId } = useParams();
  const [searchParams] = useSearchParams();
  const deviceToken = searchParams.get('token') || null;
  const [items, setItems] = useState([]);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const isAndroid = /Android/i.test(navigator.userAgent);
  const [needInteraction, setNeedInteraction] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const interactedRef = useRef(false);
  const timerRef = useRef();
  const pausedRef = useRef(false);
  const hideControlsTimerRef = useRef();
  const timerStartRef = useRef(0);   // when current timer was started (ms)
  const timerDurRef = useRef(0);     // full duration for current item (ms)

  // Keep ref in sync so callbacks see latest value without re-binding
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const load = useCallback(async () => {
    try {
      const data = await api.getScreenPlaylist(screenId, deviceToken);
      setItems(prev => {
        const prevJson = JSON.stringify(prev);
        const nextJson = JSON.stringify(data.items);
        if (prevJson === nextJson) return prev; // no change — keep same reference, don't retrigger timers
        addLog('info', `Плейлист обновлён`, `${data.items.length} элементов`);
        return data.items;
      });
      setLoaded(true);
      // Показываем плашку только если есть видео со звуком
      const hasAudio = data.items.some(i =>
        (i.type === 'video' && i.muted === 0) ||
        (i.type === 'scene' && (i.scene_objects || []).some(o => o.type === 'video' && o.muted !== 1))
      );
      if (hasAudio && !interactedRef.current) {
        if (isAndroid) {
          interactedRef.current = true;
          document.dispatchEvent(new Event('player-interaction'));
        } else {
          setNeedInteraction(true);
        }
      }
    } catch (e) {
      addLog('error', 'Ошибка загрузки плейлиста', e.message);
      setError('Ошибка загрузки: ' + e.message);
    }
  }, [screenId, deviceToken]);

  useEffect(() => {
    addLog('info', `Плеер запущен`, `screen=${screenId}`);
    load();
  }, [load, screenId]);

  useEffect(() => {
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // Fast command polling every 3 seconds
  useEffect(() => {
    const poll = async () => {
      try {
        const data = await api.pollScreenCommand(screenId, deviceToken);
        if (!data.command) return;
        addLog('info', `Команда: ${data.command}`);
        if (data.command === 'pause') {
          setPaused(true);
          clearTimeout(timerRef.current);
        } else if (data.command === 'resume') {
          setPaused(false);
        } else if (data.command === 'next') {
          setItems(its => { setCurrent(c => (c + 1) % (its.length || 1)); return its; });
        } else if (data.command === 'prev') {
          setItems(its => { setCurrent(c => (c - 1 + (its.length || 1)) % (its.length || 1)); return its; });
        }
      } catch { /* ignore poll errors */ }
    };
    const interval = setInterval(poll, 3_000);
    return () => clearInterval(interval);
  }, [screenId]);

  const itemsLengthRef = useRef(1);
  useEffect(() => { itemsLengthRef.current = items.length || 1; }, [items.length]);

  const advance = useCallback(() => {
    if (pausedRef.current) return;
    setCurrent(c => (c + 1) % itemsLengthRef.current);
  }, []);

  const next = useCallback(() => {
    setCurrent(c => (c + 1) % itemsLengthRef.current);
  }, []);

  const prev = useCallback(() => {
    setCurrent(c => (c - 1 + itemsLengthRef.current) % itemsLengthRef.current);
  }, []);

  const togglePause = useCallback(() => {
    setPaused(v => {
      const nowPaused = !v;
      if (nowPaused) {
        clearTimeout(timerRef.current);
        // record how much time elapsed so resume can use remaining time
        timerDurRef.current = Math.max(0, timerDurRef.current - (Date.now() - timerStartRef.current));
      }
      return nowPaused;
    });
  }, []);

  const item = items[current];

  // Reset remaining time whenever item changes
  useEffect(() => {
    timerDurRef.current = 0;
  }, [item?.id]);

  useEffect(() => {
    if (!item) return;
    if (item.type === 'video') return;  // video calls onEnded itself
    if (item.type === 'pdf') return;    // pdf calls onEnded itself after all pages
    if (paused) return; // don't start timer while paused

    const isScroll = (item.type === 'webpage' || item.type === 'html') &&
      item.scroll_behavior === 'smooth';
    const dur = item.type === 'scene'
      ? (item.scene_duration ?? item.duration)
      : isScroll
        ? (item.scroll_duration ?? item.duration)
        : (item.duration_override ?? item.duration);
    if (!dur || dur === 0) return; // unlimited

    // For scroll items add 1500ms to match the iframe load delay before scroll starts
    const fullMs = dur * 1000 + (isScroll ? 1500 : 0);

    // Use remaining time if resuming from pause, otherwise full duration
    const remaining = timerDurRef.current > 0 ? timerDurRef.current : fullMs;
    timerDurRef.current = remaining;
    timerStartRef.current = Date.now();
    timerRef.current = setTimeout(advance, remaining);
    return () => clearTimeout(timerRef.current);
  }, [item, advance, paused]);

  // Keyboard: L = logs, → = next, ← = prev, Space = pause/resume, F = fullscreen
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'l' || e.key === 'L') setShowLog(v => !v);
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      if (e.key === ' ') { e.preventDefault(); togglePause(); }
      if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
        else document.exitFullscreen?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev, togglePause]);

  // Mouse move — show controls overlay, hide after 3s of inactivity
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => () => clearTimeout(hideControlsTimerRef.current), []);

  const handleInteraction = useCallback(() => {
    interactedRef.current = true;
    setNeedInteraction(false);
    document.dispatchEvent(new Event('player-interaction'));
  }, []);

  if (error) return <div className="player-error">{error}</div>;
  if (!loaded) return <div className="player-loading">Загрузка...</div>;
  if (!items.length) return (
    <div className="player-empty">
      <div>Плейлист пуст</div>
      <div style={{ fontSize: 14, marginTop: 8, opacity: 0.5 }}>Назначьте плейлист в настройках экрана</div>
    </div>
  );

  return (
    <div className="player-root" onMouseMove={handleMouseMove}>
      {needInteraction && (
        <div className="player-interact-overlay" onClick={handleInteraction}>
          <div className="player-interact-box">
            <div className="player-interact-icon">🔊</div>
            <div>Нажмите для включения звука</div>
          </div>
        </div>
      )}
      <div className="player-slide">
        {item.type === 'image'   && <SlideImage item={item} />}
        {item.type === 'video'   && <SlideVideo item={item} onEnded={advance} paused={paused} />}
        {item.type === 'webpage' && <SlideWebpage item={item} onAdvance={advance} duration={item.scroll_behavior === 'smooth' ? (item.scroll_duration ?? item.duration) : (item.duration_override ?? item.duration)} paused={paused} />}
        {item.type === 'html'    && <SlideHtml item={item} duration={item.scroll_behavior === 'smooth' ? (item.scroll_duration ?? item.duration) : (item.duration_override ?? item.duration)} paused={paused} />}
        {item.type === 'pdf'     && <SlidePdf item={item} onEnded={advance} paused={paused} />}
        {item.type === 'scene'   && <SlideScene item={item} onEnded={advance} paused={paused} />}
      </div>

      <ProgressBar
        key={`${item.id}-${current}`}
        duration={item.type === 'scene' ? (item.scene_duration ?? item.duration ?? 30) : (item.duration_override ?? item.duration)}
        running={!paused && item.type !== 'video' && item.type !== 'pdf'}
      />

      <SlideInfo item={item} total={items.length} idx={current} />

      {/* Controls overlay — appears on mouse move, hides after 3s */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16,
        transition: 'opacity 0.3s', opacity: showControls ? 1 : 0,
        pointerEvents: showControls ? 'auto' : 'none',
        zIndex: 100,
      }}>
        <button onClick={prev} title="Предыдущий (←)" style={{
          background: 'none', border: 'none', color: '#fff', fontSize: 22,
          cursor: 'pointer', borderRadius: '50%', width: 40, height: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0,
        }}>⏮</button>
        <button onClick={togglePause} title={paused ? 'Возобновить (Space)' : 'Пауза (Space)'} style={{
          background: 'none', border: 'none', color: '#fff', fontSize: 22,
          cursor: 'pointer', borderRadius: '50%', width: 40, height: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0,
        }}>{paused ? '▶' : '⏸'}</button>
        <button onClick={next} title="Следующий (→)" style={{
          background: 'none', border: 'none', color: '#fff', fontSize: 22,
          cursor: 'pointer', borderRadius: '50%', width: 40, height: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0,
        }}>⏭</button>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{current + 1} / {items.length}</span>
      </div>

      {/* Кнопка лога — всегда видна в углу */}
      <button
        className="log-toggle-btn"
        onClick={() => setShowLog(v => !v)}
        title="Журнал событий (L)"
      >
        📋
      </button>

      {showLog && <LogOverlay onClose={() => setShowLog(false)} />}
    </div>
  );
}
