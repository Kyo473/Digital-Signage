import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api, PermissionError } from '../api';
import { useAuth } from '../AuthContext';
import AccessDenied from '../components/AccessDenied';

const LEVEL_COLORS = {
  error: 'var(--red)',
  warn: '#f59e0b',
  info: 'var(--t2)',
  debug: 'var(--t3)',
};

const LEVEL_BG = {
  error: 'rgba(239,68,68,0.12)',
  warn: 'rgba(245,158,11,0.12)',
  info: 'rgba(255,255,255,0.06)',
  debug: 'rgba(255,255,255,0.03)',
};

const LEVELS = ['', 'info', 'warn', 'error', 'debug'];
const LEVEL_LABELS = { '': 'Все уровни', info: 'Info', warn: 'Warn', error: 'Error', debug: 'Debug' };

const CATEGORIES = ['', 'http', 'auth', 'system', 'proxy', 'webhook'];
const CAT_LABELS = { '': 'Все категории', http: 'HTTP', auth: 'Auth', system: 'System', proxy: 'Proxy', webhook: 'Webhook' };

function formatTs(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function MetaCell({ meta }) {
  const [open, setOpen] = useState(false);
  const keys = Object.keys(meta || {}).filter(k => meta[k] != null);
  if (!keys.length) return <span style={{ color: 'var(--t3)', fontSize: 11 }}>—</span>;

  return (
    <span>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '1px 6px', fontSize: 10, cursor: 'pointer',
          color: 'var(--t2)', fontFamily: 'monospace',
        }}
      >
        {open ? '▲' : '▼'} {keys.length} поле{keys.length !== 1 ? (keys.length < 5 ? 'я' : 'й') : ''}
      </button>
      {open && (
        <pre style={{
          margin: '4px 0 0', padding: '6px 8px',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 6, fontSize: 11, color: 'var(--t2)',
          maxWidth: 400, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {JSON.stringify(meta, null, 2)}
        </pre>
      )}
    </span>
  );
}

function LevelBadge({ level }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 7px', borderRadius: 4,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
      color: LEVEL_COLORS[level] || 'var(--t3)',
      background: LEVEL_BG[level] || 'transparent',
      border: `1px solid ${LEVEL_COLORS[level] || 'var(--border)'}`,
      minWidth: 42, textAlign: 'center',
    }}>
      {level}
    </span>
  );
}

function CategoryBadge({ category }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 7px', borderRadius: 4,
      fontSize: 10, fontWeight: 600,
      color: 'var(--t3)',
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
      minWidth: 42, textAlign: 'center',
    }}>
      {category}
    </span>
  );
}

export default function LogsPage() {
  const { hasPerm } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filterLevel, setFilterLevel] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [clearing, setClearing] = useState(false);
  const timerRef = useRef(null);

  const canView = hasPerm('logs.view');
  const canManage = hasPerm('logs.clear');

  const fetchLogs = useCallback(async (opts = {}) => {
    if (!canView) return;
    const isMore = opts.loadMore;
    if (isMore) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const params = {
        level: filterLevel || undefined,
        category: filterCategory || undefined,
        search: filterSearch || undefined,
        limit: 200,
      };
      if (isMore && logs.length > 0) {
        params.before = logs[logs.length - 1].id;
      }
      const data = await api.getLogs(params);
      if (isMore) {
        setLogs(prev => [...prev, ...data]);
        setHasMore(data.length >= 200);
      } else {
        setLogs(data);
        setHasMore(data.length >= 200);
      }
    } catch (e) {
      if (!(e instanceof PermissionError)) setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [canView, filterLevel, filterCategory, filterSearch, logs]);

  // Initial fetch and filter changes
  useEffect(() => {
    if (!canView) return;
    const params = {
      level: filterLevel || undefined,
      category: filterCategory || undefined,
      search: filterSearch || undefined,
      limit: 200,
    };
    setLoading(true);
    setError('');
    api.getLogs(params)
      .then(data => {
        setLogs(data);
        setHasMore(data.length >= 200);
      })
      .catch(e => { if (!(e instanceof PermissionError)) setError(e.message); })
      .finally(() => setLoading(false));
  }, [canView, filterLevel, filterCategory, filterSearch]);

  // Auto-refresh every 5s
  useEffect(() => {
    if (!autoRefresh || !canView) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      const params = {
        level: filterLevel || undefined,
        category: filterCategory || undefined,
        search: filterSearch || undefined,
        limit: 200,
      };
      api.getLogs(params)
        .then(data => {
          setLogs(data);
          setHasMore(data.length >= 200);
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, canView, filterLevel, filterCategory, filterSearch]);

  const handleLoadMore = useCallback(() => {
    if (!logs.length) return;
    const lastId = logs[logs.length - 1].id;
    const params = {
      level: filterLevel || undefined,
      category: filterCategory || undefined,
      search: filterSearch || undefined,
      limit: 200,
      before: lastId,
    };
    setLoadingMore(true);
    api.getLogs(params)
      .then(data => {
        setLogs(prev => [...prev, ...data]);
        setHasMore(data.length >= 200);
      })
      .catch(e => { if (!(e instanceof PermissionError)) setError(e.message); })
      .finally(() => setLoadingMore(false));
  }, [logs, filterLevel, filterCategory, filterSearch]);

  const handleClear = async () => {
    if (!window.confirm('Очистить все логи?')) return;
    setClearing(true);
    try {
      await api.clearLogs();
      setLogs([]);
      setHasMore(false);
    } catch (e) {
      if (!(e instanceof PermissionError)) setError(e.message);
    } finally { setClearing(false); }
  };

  if (!canView) return <AccessDenied />;

  // Подсчёт warn/error за последние 5 минут
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const recentIssues = logs.filter(l => l.ts >= fiveMinAgo && (l.level === 'warn' || l.level === 'error'));
  const recentErrors = recentIssues.filter(l => l.level === 'error').length;
  const recentWarns = recentIssues.filter(l => l.level === 'warn').length;

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Логи</h1>
          <p style={{ color: 'var(--t3)', fontSize: 13, marginTop: 4, marginBottom: 0 }}>
            Системный журнал событий
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Recent issues indicator */}
          {(recentErrors > 0 || recentWarns > 0) && (
            <div style={{
              display: 'flex', gap: 6, alignItems: 'center',
              padding: '4px 10px', borderRadius: 6,
              background: recentErrors > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
              border: `1px solid ${recentErrors > 0 ? 'var(--red)' : '#f59e0b'}`,
              fontSize: 12, color: recentErrors > 0 ? 'var(--red)' : '#f59e0b',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              {recentErrors > 0 && <span>{recentErrors} ошиб{recentErrors === 1 ? 'ка' : recentErrors < 5 ? 'ки' : 'ок'}</span>}
              {recentWarns > 0 && <span>{recentWarns} предупреж{recentWarns === 1 ? 'дение' : recentWarns < 5 ? 'дения' : 'дений'}</span>}
              <span style={{ opacity: 0.7 }}>за 5 мин</span>
            </div>
          )}

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              cursor: 'pointer',
              background: autoRefresh ? 'rgba(99,102,241,0.15)' : 'var(--surface2)',
              border: `1px solid ${autoRefresh ? 'var(--a1)' : 'var(--border)'}`,
              color: autoRefresh ? 'var(--a1)' : 'var(--t2)',
              transition: 'all 0.15s',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            {autoRefresh ? 'Авто: ВКЛ' : 'Авто: ВЫКЛ'}
          </button>

          {/* Manual refresh */}
          <button
            onClick={() => {
              const params = {
                level: filterLevel || undefined,
                category: filterCategory || undefined,
                search: filterSearch || undefined,
                limit: 200,
              };
              setLoading(true);
              api.getLogs(params)
                .then(data => { setLogs(data); setHasMore(data.length >= 200); })
                .catch(e => { if (!(e instanceof PermissionError)) setError(e.message); })
                .finally(() => setLoading(false));
            }}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              cursor: 'pointer', background: 'var(--surface2)',
              border: '1px solid var(--border)', color: 'var(--t2)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
              style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}>
              <polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/>
            </svg>
            Обновить
          </button>

          {/* Export logs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {['json', 'csv'].map(fmt => (
              <button
                key={fmt}
                onClick={async () => {
                  const token = localStorage.getItem('ds_token');
                  const params = new URLSearchParams({ format: fmt });
                  if (filterLevel) params.set('level', filterLevel);
                  if (filterCategory) params.set('category', filterCategory);
                  if (filterSearch) params.set('search', filterSearch);
                  const res = await fetch(`/api/logs/export?${params}`, { headers: { Authorization: `Bearer ${token}` } });
                  const blob = await res.blob();
                  const date = new Date().toISOString().slice(0, 10);
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `ds-logs-${date}.${fmt}`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                  cursor: 'pointer', background: 'var(--surface2)',
                  border: '1px solid var(--border)', color: 'var(--t2)',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Clear logs */}
          {canManage && (
            <button
              onClick={handleClear}
              disabled={clearing}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                cursor: 'pointer', background: 'rgba(239,68,68,0.08)',
                border: '1px solid var(--red)', color: 'var(--red)',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              {clearing ? 'Очистка...' : 'Очистить логи'}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16,
        padding: '12px 14px', background: 'var(--surface2)',
        border: '1px solid var(--border)', borderRadius: 8,
      }}>
        <select
          value={filterLevel}
          onChange={e => setFilterLevel(e.target.value)}
          style={{
            background: 'var(--surface3)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '5px 10px', fontSize: 12, color: 'var(--t1)',
            cursor: 'pointer',
          }}
        >
          {LEVELS.map(l => (
            <option key={l} value={l}>{LEVEL_LABELS[l]}</option>
          ))}
        </select>

        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          style={{
            background: 'var(--surface3)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '5px 10px', fontSize: 12, color: 'var(--t1)',
            cursor: 'pointer',
          }}
        >
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{CAT_LABELS[c]}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Поиск по сообщению или мета..."
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 200,
            background: 'var(--surface3)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '5px 10px', fontSize: 12, color: 'var(--t1)',
            outline: 'none',
          }}
        />

        <span style={{ color: 'var(--t3)', fontSize: 12, display: 'flex', alignItems: 'center' }}>
          {logs.length} записей
        </span>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: 12,
          background: 'rgba(239,68,68,0.08)', border: '1px solid var(--red)',
          borderRadius: 8, color: 'var(--red)', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div style={{
        background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: 10, overflow: 'hidden',
      }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '90px 70px 80px 1fr auto',
          gap: 0,
          padding: '8px 14px',
          background: 'var(--surface3)',
          borderBottom: '1px solid var(--border)',
          fontSize: 11, fontWeight: 600, color: 'var(--t3)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          <span>Время</span>
          <span>Уровень</span>
          <span>Категория</span>
          <span>Сообщение</span>
          <span>Meta</span>
        </div>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
            Загрузка...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
            Логов нет
          </div>
        ) : (
          logs.map((entry, i) => (
            <div
              key={entry.id}
              title={formatDate(entry.ts)}
              style={{
                display: 'grid',
                gridTemplateColumns: '90px 70px 80px 1fr auto',
                gap: 0,
                padding: '6px 14px',
                borderBottom: i < logs.length - 1 ? '1px solid var(--border)' : 'none',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                alignItems: 'flex-start',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
              onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'}
            >
              <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'monospace', paddingTop: 1 }}>
                {formatTs(entry.ts)}
              </span>
              <span style={{ paddingTop: 1 }}>
                <LevelBadge level={entry.level} />
              </span>
              <span style={{ paddingTop: 1 }}>
                <CategoryBadge category={entry.category} />
              </span>
              <span style={{
                fontSize: 12, color: 'var(--t1)', wordBreak: 'break-word',
                fontFamily: 'monospace', paddingRight: 12,
              }}>
                {entry.message}
              </span>
              <div style={{ minWidth: 60 }}>
                <MetaCell meta={entry.meta} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Load more */}
      {hasMore && !loading && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            style={{
              padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 500,
              cursor: 'pointer', background: 'var(--surface2)',
              border: '1px solid var(--border)', color: 'var(--t2)',
            }}
          >
            {loadingMore ? 'Загрузка...' : 'Загрузить ещё'}
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
