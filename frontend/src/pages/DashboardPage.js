import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, PermissionError } from '../api';
import AccessDenied from '../components/AccessDenied';

function timeAgo(ts) {
  if (!ts) return '—';
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return `${d}с назад`;
  if (d < 3600) return `${Math.floor(d / 60)}м назад`;
  if (d < 86400) return `${Math.floor(d / 3600)}ч назад`;
  return `${Math.floor(d / 86400)}д назад`;
}
const isOnline = ts => ts && (Math.floor(Date.now() / 1000) - ts) < 30;

const TYPE_LABEL = { image: 'Фото', video: 'Видео', pdf: 'PDF', webpage: 'Веб', html: 'HTML' };
const TYPE_COLOR = { image: '#22d3a0', video: '#c97eff', pdf: '#f0b040', webpage: '#60a5fa', html: '#f97316' };

function StatCard({ value, label, sub, subColor, onClick, accent }) {
  return (
    <div
      className="stat-card"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="stat-value" style={accent ? { color: accent } : {}}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && (
        <div style={{ fontSize: 11, marginTop: 4, color: subColor || 'var(--t3)' }}>{sub}</div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await api.getDashboard();
      setData(d);
    } catch (e) {
      if (e instanceof PermissionError) setDenied(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 10_000);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  if (denied) return <AccessDenied />;

  if (loading) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--t3)' }}>
        Загрузка...
      </div>
    );
  }

  if (!data) return null;

  const { devices, screens, content, playlists, groups, recentErrors, deviceList } = data;
  const approved = deviceList.filter(d => d.approved);
  const pending  = deviceList.filter(d => !d.approved);
  const sortedDevices = [
    ...approved.filter(d => isOnline(d.last_seen)),
    ...approved.filter(d => !isOnline(d.last_seen)),
    ...pending,
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title-row">
          <h1 className="page-title">Дашборд</h1>
          <div className="page-sub">Обновляется каждые 10 секунд</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5 }}>
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Обновить
        </button>
      </div>

      {/* Счётчики */}
      <div className="stats-strip" style={{ marginBottom: 24 }}>
        <StatCard
          value={`${devices.online} / ${devices.total}`}
          label="Устройств онлайн"
          sub={devices.pending > 0 ? `${devices.pending} ожидают подтверждения` : null}
          subColor="var(--yellow)"
          accent={devices.online > 0 ? 'var(--green)' : undefined}
          onClick={() => navigate('/devices')}
        />
        <StatCard
          value={screens.total}
          label="Экранов"
          sub={screens.withoutContent > 0 ? `${screens.withoutContent} без контента` : 'Все настроены'}
          subColor={screens.withoutContent > 0 ? 'var(--yellow)' : 'var(--green)'}
          onClick={() => navigate('/screens')}
        />
        <StatCard
          value={content.total}
          label="Файлов в библиотеке"
          sub={`${playlists.total} пл. · ${groups.total} гр.`}
          onClick={() => navigate('/content')}
        />
        <StatCard
          value={devices.pending}
          label="Ожидают подтверждения"
          accent={devices.pending > 0 ? 'var(--yellow)' : undefined}
          sub={devices.pending > 0 ? 'Требуют действия' : 'Нет новых'}
          subColor={devices.pending > 0 ? 'var(--yellow)' : 'var(--t3)'}
          onClick={() => navigate('/devices')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'start' }}>

        {/* Список устройств */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 10 }}>
            Устройства
          </div>
          {sortedDevices.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" style={{ opacity: 0.3 }}>
                <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              <strong>Нет устройств</strong>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sortedDevices.map(d => {
                const online = isOnline(d.last_seen);
                const isPending = !d.approved;
                return (
                  <div key={d.id} className="list-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                    <span className={online ? 'dot-online' : 'dot-offline'} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.name || d.code}
                        {isPending && (
                          <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: 'var(--yellow)', background: 'rgba(240,176,64,0.12)', padding: '1px 5px', borderRadius: 4 }}>
                            ожидает
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 1 }}>
                        {d.screen_name ? d.screen_name : <span style={{ opacity: 0.5 }}>Экран не назначен</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: online ? 'var(--green)' : 'var(--t3)', textAlign: 'right', flexShrink: 0 }}>
                      {online ? '● Онлайн' : timeAgo(d.last_seen)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Правая колонка */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Последние ошибки */}
          {recentErrors.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 10 }}>
                Последние предупреждения
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {recentErrors.slice(0, 5).map((e, i) => (
                  <div key={i} className="list-row" style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                        background: e.level === 'error' ? 'rgba(240,64,112,0.15)' : 'rgba(240,176,64,0.15)',
                        color: e.level === 'error' ? 'var(--red)' : 'var(--yellow)',
                      }}>{e.level}</span>
                      <span style={{ fontSize: 10, color: 'var(--t3)' }}>{e.category}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.message}
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: '100%' }} onClick={() => navigate('/logs')}>
                Открыть логи
              </button>
            </div>
          )}

          {/* Контент по типам */}
          {content.total > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 10 }}>
                Контент по типам
              </div>
              <div className="list-row" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(content.byType).map(([type, count]) => (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: TYPE_COLOR[type] || 'var(--t3)', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'var(--t2)' }}>{TYPE_LABEL[type] || type}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>{count}</div>
                    <div style={{ width: 60, height: 4, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.round(count / content.total * 100)}%`,
                        height: '100%',
                        background: TYPE_COLOR[type] || 'var(--a1)',
                        borderRadius: 2,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
