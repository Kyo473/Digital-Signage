import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api, PermissionError } from '../api';
import { useAuth } from '../AuthContext';
import AccessDenied from '../components/AccessDenied';

// ── UserModal ─────────────────────────────────────────────────────────────────
function UserModal({ user, roles, adminCount, onClose, onSave }) {
  const isEdit = !!user;
  const [username, setUsername] = useState(user?.username || '');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId]     = useState(user?.role_id || roles[0]?.id || '');
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [step, setStep]         = useState('form'); // 'form' | 'confirm'

  const isLastAdmin   = user?.role_id === 'role_admin' && adminCount <= 1;
  const willDowngrade = isEdit && user?.role_id === 'role_admin' && roleId !== 'role_admin';

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const doSave = async () => {
    setError(''); setSaving(true);
    try {
      if (isEdit) {
        const data = { role_id: roleId };
        if (username !== user.username) data.username = username;
        if (password) data.password = password;
        await api.updateUser(user.id, data);
      } else {
        if (!password) { setError('Пароль обязателен'); setSaving(false); return; }
        await api.createUser({ username, password, role_id: roleId });
      }
      onSave();
    } catch (e) {
      try { setError(JSON.parse(e.message).error); } catch { setError(e.message); }
      setStep('form');
    } finally { setSaving(false); }
  };

  const handleSave = () => {
    if (willDowngrade && isLastAdmin) { setError('Нельзя убрать роль у единственного администратора'); return; }
    if (willDowngrade) { setStep('confirm'); return; }
    doSave();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 420 }}>
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? 'Редактировать' : 'Новый пользователь'}</h2>
          <button className="modal-close" onClick={onClose}>&#x2715;</button>
        </div>
        {step === 'confirm' ? (
          <>
            <div className="modal-body">
              <div style={{ display:'flex', gap:12, padding:'12px 14px', background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:10 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <div>
                  <div style={{ fontWeight:600, fontSize:14, color:'var(--t1)', marginBottom:4 }}>Подтвердите смену роли</div>
                  <div style={{ fontSize:13, color:'var(--t2)', lineHeight:1.5 }}>
                    Пользователь <b>{user.username}</b> потеряет права администратора.
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setStep('form')}>Назад</button>
              <button className="btn btn-primary" onClick={doSave} disabled={saving}>{saving ? 'Сохранение...' : 'Подтвердить'}</button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-body">
              <div className="form-group">
                <label>Логин</label>
                <input className="form-input" value={username} onChange={e => setUsername(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>{isEdit ? 'Новый пароль (пусто — не менять)' : 'Пароль'}</label>
                <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} required={!isEdit} />
              </div>
              <div className="form-group">
                <label>Роль</label>
                <select className="form-input" value={roleId} onChange={e => setRoleId(e.target.value)}>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                {isLastAdmin && willDowngrade && (
                  <div style={{ fontSize:11, color:'var(--red)', marginTop:4 }}>Единственный администратор — нельзя снять роль</div>
                )}
              </div>
              {error && <div style={{ color:'var(--red)', fontSize:13, marginTop:4 }}>{error}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || (willDowngrade && isLastAdmin)}>
                {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── BulkRoleModal ─────────────────────────────────────────────────────────────
function BulkRoleModal({ count, roles, onClose, onConfirm }) {
  const [roleId, setRoleId] = useState(roles[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const go = async () => { setSaving(true); try { await onConfirm(roleId); } finally { setSaving(false); } };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 360 }}>
        <div className="modal-header">
          <h2 className="modal-title">Изменить роль</h2>
          <button className="modal-close" onClick={onClose}>&#x2715;</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize:13, color:'var(--t2)', marginBottom:14 }}>Выбрано пользователей: <b>{count}</b></div>
          <div className="form-group">
            <label>Новая роль</label>
            <select className="form-input" value={roleId} onChange={e => setRoleId(e.target.value)}>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={go} disabled={saving}>{saving ? 'Применение...' : 'Применить'}</button>
        </div>
      </div>
    </div>
  );
}

// ── ExportModal ───────────────────────────────────────────────────────────────
function ExportModal({ onClose }) {
  const [fmt, setFmt]         = useState('json');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const download = async () => {
    setLoading(true); setError('');
    try {
      const token = localStorage.getItem('ds_token');
      const res   = await fetch('/api/users/export?format=' + fmt, { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Ошибка ' + res.status); }
      const blob   = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl; a.download = 'users.' + fmt;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
      onClose();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 340 }}>
        <div className="modal-header">
          <h2 className="modal-title">Экспорт пользователей</h2>
          <button className="modal-close" onClick={onClose}>&#x2715;</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Формат</label>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:4 }}>
              {[['json','JSON','Резервная копия, подходит для импорта'],['csv','CSV','Excel, Google Sheets'],['tsv','TSV','Tab-separated']].map(([f,label,desc]) => (
                <label key={f} style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'8px 12px', borderRadius:8, border:'1px solid ' + (fmt===f?'var(--a1)':'var(--border)'), background: fmt===f?'var(--accent-soft)':'transparent', transition:'all 0.1s' }}>
                  <input type="radio" name="fmt" value={f} checked={fmt===f} onChange={() => setFmt(f)} style={{ accentColor:'var(--a1)', flexShrink:0 }} />
                  <div>
                    <div style={{ fontWeight:600, fontSize:13, color:'var(--t1)' }}>{label}</div>
                    <div style={{ fontSize:11, color:'var(--t3)' }}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {error && <div style={{ color:'var(--red)', fontSize:13, marginTop:8 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={download} disabled={loading}>{loading ? 'Загрузка...' : 'Скачать'}</button>
        </div>
      </div>
    </div>
  );
}

// ── ImportModal ───────────────────────────────────────────────────────────────
function ImportModal({ roles, onClose, onDone }) {
  const [preview, setPreview]     = useState(null);
  const [parseErr, setParseErr]   = useState('');
  const [onConflict, setConflict] = useState('skip');
  const [saving, setSaving]       = useState(false);
  const [result, setResult]       = useState(null);
  const fileRef = useRef();
  const roleMap = Object.fromEntries(roles.map(r => [r.id, r.name]));

  function parseCsvLine(line) {
    const res = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (inQ && line[i+1]==='"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (c === ',' && !inQ) { res.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    res.push(cur.trim()); return res;
  }

  const parseFile = f => {
    setParseErr(''); setPreview(null); setResult(null);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target.result;
        if (f.name.endsWith('.json')) {
          const data = JSON.parse(text);
          if (!Array.isArray(data)) throw new Error('Ожидается массив');
          setPreview(data);
        } else {
          const sep = f.name.endsWith('.tsv') ? '\t' : ',';
          const lines = text.replace(/\r/g,'').split('\n').filter(Boolean);
          const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g,'').trim());
          const rows = lines.slice(1)
            .map(line => Object.fromEntries(headers.map((h,i) => [h, (sep===','?parseCsvLine(line):line.split('\t'))[i]||''])))
            .filter(r => r.username);
          setPreview(rows);
        }
      } catch(err) { setParseErr('Ошибка разбора: ' + err.message); }
    };
    reader.readAsText(f, 'utf-8');
  };

  const submit = async () => {
    setSaving(true);
    try { setResult(await api.importUsers({ users: preview, on_conflict: onConflict })); }
    catch(e) { try { setParseErr(JSON.parse(e.message).error); } catch { setParseErr(e.message); } }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 500, maxHeight:'85vh', display:'flex', flexDirection:'column' }}>
        <div className="modal-header">
          <h2 className="modal-title">Импорт пользователей</h2>
          <button className="modal-close" onClick={onClose}>&#x2715;</button>
        </div>
        <div className="modal-body" style={{ flex:1, overflowY:'auto' }}>
          {result ? (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>Импорт завершён</div>
              {[['Создано', result.created, '#10b981'],['Обновлено', result.updated, 'var(--a1)'],['Пропущено', result.skipped, 'var(--t3)']].map(([l,v,c]) => (
                <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'8px 12px', borderRadius:8, background:'var(--surface2)' }}>
                  <span style={{ fontSize:13, color:'var(--t2)' }}>{l}</span>
                  <b style={{ fontSize:13, color:c }}>{v}</b>
                </div>
              ))}
              {result.errors && result.errors.map((e,i) => <div key={i} style={{ fontSize:12, color:'var(--red)' }}>- {e}</div>)}
            </div>
          ) : (
            <>
              <div
                onClick={() => fileRef.current && fileRef.current.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) parseFile(f); }}
                style={{ border:'2px dashed ' + (preview?'var(--a1)':'var(--border)'), borderRadius:10, padding:'24px 16px', textAlign:'center', cursor:'pointer', background:preview?'var(--accent-soft)':'transparent', marginBottom:14 }}
              >
                <input ref={fileRef} type="file" accept=".json,.csv,.tsv" style={{ display:'none' }} onChange={e => { if(e.target.files[0]) parseFile(e.target.files[0]); }} />
                <div style={{ fontSize:13, fontWeight:600, color:'var(--t1)' }}>{preview ? 'Загружено ' + preview.length + ' строк' : 'Нажмите или перетащите файл'}</div>
                <div style={{ fontSize:11, color:'var(--t3)', marginTop:4 }}>JSON, CSV, TSV</div>
              </div>
              {parseErr && <div style={{ color:'var(--red)', fontSize:13, marginBottom:10 }}>{parseErr}</div>}
              {preview && (
                <>
                  <div style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', marginBottom:12 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', padding:'6px 12px', background:'var(--surface2)', borderBottom:'1px solid var(--border)' }}>
                      <span style={{ fontSize:11, fontWeight:700, color:'var(--t3)', textTransform:'uppercase' }}>Логин</span>
                      <span style={{ fontSize:11, fontWeight:700, color:'var(--t3)', textTransform:'uppercase' }}>Роль</span>
                    </div>
                    <div style={{ maxHeight:160, overflowY:'auto' }}>
                      {preview.slice(0,50).map((u,i) => (
                        <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', padding:'5px 12px', borderBottom: i < Math.min(preview.length,50)-1 ? '1px solid var(--border)' : 'none', background:i%2===0?'transparent':'var(--surface2)' }}>
                          <span style={{ fontSize:12, color:'var(--t1)' }}>{u.username}</span>
                          <span style={{ fontSize:12, color:'var(--t2)' }}>{roleMap[u.role_id]||u.role_name||u.role_id||'—'}</span>
                        </div>
                      ))}
                      {preview.length > 50 && <div style={{ padding:'4px 12px', fontSize:11, color:'var(--t3)' }}>...ещё {preview.length-50}</div>}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Если пользователь уже существует</label>
                    <div style={{ display:'flex', gap:8, marginTop:4 }}>
                      {[['skip','Пропустить'],['update','Обновить роль']].map(([v,l]) => (
                        <label key={v} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', padding:'6px 12px', borderRadius:8, border:'1px solid ' + (onConflict===v?'var(--a1)':'var(--border)'), background:onConflict===v?'var(--accent-soft)':'transparent', fontSize:13 }}>
                          <input type="radio" name="conflict" value={v} checked={onConflict===v} onChange={() => setConflict(v)} style={{ accentColor:'var(--a1)' }} /> {l}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          {result
            ? <button className="btn btn-primary" onClick={() => { onDone(); onClose(); }}>Готово</button>
            : <>
                <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
                <button className="btn btn-primary" onClick={submit} disabled={!preview || !preview.length || saving}>
                  {saving ? 'Импорт...' : 'Импортировать (' + (preview ? preview.length : 0) + ')'}
                </button>
              </>
          }
        </div>
      </div>
    </div>
  );
}

// ── UsersPage ─────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { user: me, hasPerm } = useAuth();
  const [users, setUsers]   = useState([]);
  const [roles, setRoles]   = useState([]);
  const [modal, setModal]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [denied, setDenied]     = useState(false);
  const [search, setSearch]     = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [sel, setSel]           = useState([]);
  const [showBulkRole, setShowBulkRole] = useState(false);
  const [showExport, setShowExport]     = useState(false);
  const [showImport, setShowImport]     = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([api.getUsers(), api.getRoles()]);
      setUsers(u); setRoles(r);
    } catch (e) {
      if (e instanceof PermissionError) setDenied(true);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const adminCount = users.filter(u => u.role_id === 'role_admin').length;

  const filtered = users.filter(u => {
    const ms = !search || u.username.toLowerCase().includes(search.toLowerCase());
    const mr = !filterRole || u.role_id === filterRole;
    return ms && mr;
  });

  const allChecked  = filtered.length > 0 && filtered.every(u => sel.includes(u.id));
  const someChecked = filtered.some(u => sel.includes(u.id));

  const toggleOne = id => setSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleAll = () => {
    if (allChecked) {
      setSel(prev => prev.filter(id => !filtered.find(u => u.id === id)));
    } else {
      setSel(prev => {
        const next = [...prev];
        filtered.forEach(u => { if (!next.includes(u.id)) next.push(u.id); });
        return next;
      });
    }
  };

  const delOne = async u => {
    if (!window.confirm('Удалить «' + u.username + '»?')) return;
    try { await api.deleteUser(u.id); setSel(p => p.filter(x => x !== u.id)); await load(); }
    catch (e) { if (!(e instanceof PermissionError)) { try { alert(JSON.parse(e.message).error); } catch { alert(e.message); } } }
  };

  const bulkDelete = async () => {
    const ids = sel.filter(id => id !== me?.id);
    if (!ids.length) return;
    if (!window.confirm('Удалить ' + ids.length + ' пользователей?')) return;
    try { await api.bulkUsers({ ids, action: 'delete' }); setSel([]); await load(); }
    catch (e) { try { alert(JSON.parse(e.message).error); } catch { alert(e.message); } }
  };

  const bulkSetRole = async roleId => {
    try { await api.bulkUsers({ ids: sel, action: 'set_role', role_id: roleId }); setSel([]); setShowBulkRole(false); await load(); }
    catch (e) { setShowBulkRole(false); try { alert(JSON.parse(e.message).error); } catch { alert(e.message); } }
  };

  if (loading) return <div style={{ padding:'48px 0', textAlign:'center', color:'var(--t3)' }}>Загрузка...</div>;
  if (denied)  return <AccessDenied />;

  const selNoMe = sel.filter(id => id !== me?.id);

  return (
    <div>
      {/* Шапка */}
      <div className="page-header">
        <div className="page-title-row">
          <h1 className="page-title">Пользователи</h1>
          <div className="page-sub">{users.length} пользователей</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {hasPerm('users.view') && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowExport(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              Экспорт
            </button>
          )}
          {hasPerm('users.create') && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowImport(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              Импорт
            </button>
          )}
          {hasPerm('users.create') && (
            <button className="btn btn-primary" onClick={() => setModal('create')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              Добавить
            </button>
          )}
        </div>
      </div>

      {/* Фильтры */}
      <div style={{ display:'flex', gap:10, marginBottom:14 }}>
        <div style={{ position:'relative', flex:'1 1 200px' }}>
          <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--t3)', pointerEvents:'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input className="form-input" style={{ paddingLeft:32 }} placeholder="Поиск по логину..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-input" style={{ width:180 }} value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="">Все роли</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {(search || filterRole) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterRole(''); }}>Сбросить</button>
        )}
      </div>

      {/* Панель массовых действий */}
      {sel.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', marginBottom:12, background:'var(--accent-soft)', border:'1px solid var(--a1)', borderRadius:'var(--r)', flexWrap:'wrap' }}>
          <span style={{ fontWeight:700, fontSize:13, color:'var(--a1)' }}>Выбрано: {sel.length}</span>
          <div style={{ width:1, height:16, background:'var(--a1)', opacity:0.3 }} />
          {hasPerm('users.edit') && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowBulkRole(true)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Изменить роль
            </button>
          )}
          {hasPerm('users.delete') && (
            <button className="btn btn-danger btn-sm" onClick={bulkDelete} disabled={selNoMe.length === 0}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              {sel.includes(me?.id) ? 'Удалить (' + selNoMe.length + ')' : 'Удалить'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" style={{ marginLeft:'auto' }} onClick={() => setSel([])}>
            Снять выделение
          </button>
        </div>
      )}

      {/* Таблица */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r)', overflow:'hidden' }}>
        {/* Заголовок таблицы */}
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 16px', borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
          <input
            type="checkbox"
            checked={allChecked}
            ref={el => { if (el) el.indeterminate = !allChecked && someChecked; }}
            onChange={toggleAll}
            className="native-cb"
            style={{ width:15, height:15, cursor:'pointer', accentColor:'var(--a1)', flexShrink:0, display:'inline-block' }}
          />
          <div style={{ flex:1, fontSize:11, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Пользователь</div>
          <div style={{ width:170, fontSize:11, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Роль</div>
          <div style={{ width:140, fontSize:11, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'right' }}>Действия</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding:'40px 16px', textAlign:'center', color:'var(--t3)', fontSize:13 }}>
            {search || filterRole ? 'Ничего не найдено' : 'Нет пользователей'}
          </div>
        ) : filtered.map((u, idx) => {
          const isMe        = u.id === me?.id;
          const isSel       = sel.includes(u.id);
          const isOnlyAdmin = u.role_id === 'role_admin' && adminCount <= 1;
          return (
            <div key={u.id} style={{
              display:'flex', alignItems:'center', gap:12, padding:'10px 16px',
              borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
              background: isSel ? 'var(--accent-soft)' : 'transparent',
              transition:'background 0.1s',
            }}>
              <input
                type="checkbox"
                checked={isSel}
                onChange={() => toggleOne(u.id)}
                className="native-cb"
            style={{ width:15, height:15, cursor:'pointer', accentColor:'var(--a1)', flexShrink:0, display:'inline-block' }}
              />
              <div style={{ flex:1, display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                <div style={{
                  width:34, height:34, borderRadius:'50%', flexShrink:0,
                  background: isMe ? 'linear-gradient(135deg, var(--a1), #5b3fd4)' : 'var(--surface3)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:13, fontWeight:700, color: isMe ? '#fff' : 'var(--t2)',
                  border: isMe ? 'none' : '1px solid var(--border)',
                }}>
                  {u.username[0].toUpperCase()}
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:13, color:'var(--t1)', display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.username}</span>
                    {isMe && <span style={{ fontSize:10, background:'var(--accent-soft)', color:'var(--a1)', borderRadius:4, padding:'1px 6px', fontWeight:600, flexShrink:0 }}>вы</span>}
                    {isOnlyAdmin && <span style={{ fontSize:10, background:'rgba(239,68,68,0.1)', color:'var(--red)', borderRadius:4, padding:'1px 6px', fontWeight:600, flexShrink:0 }}>единств. админ</span>}
                  </div>
                </div>
              </div>
              <div style={{ width:170, flexShrink:0 }}>
                <span style={{
                  fontSize:12, fontWeight:500, padding:'3px 10px', borderRadius:20, whiteSpace:'nowrap',
                  background: u.role_id === 'role_admin' ? 'rgba(124,92,252,0.12)' : 'var(--surface2)',
                  color:      u.role_id === 'role_admin' ? 'var(--a1)' : 'var(--t2)',
                  border:'1px solid ' + (u.role_id === 'role_admin' ? 'rgba(124,92,252,0.3)' : 'var(--border)'),
                }}>
                  {u.role_name}
                </span>
              </div>
              <div style={{ width:140, flexShrink:0, display:'flex', gap:6, justifyContent:'flex-end' }}>
                {hasPerm('users.edit') && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setModal(u)}>Изменить</button>
                )}
                {hasPerm('users.delete') && !isMe && (
                  <button className="btn btn-danger btn-sm" onClick={() => delOne(u)}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length > 0 && (
        <div style={{ fontSize:12, color:'var(--t3)', marginTop:10, textAlign:'right' }}>
          Показано {filtered.length} из {users.length}
        </div>
      )}

      {/* Модалки */}
      {(modal === 'create' || (modal && typeof modal === 'object')) && (
        <UserModal user={modal === 'create' ? null : modal} roles={roles} adminCount={adminCount}
          onClose={() => setModal(null)} onSave={() => { setModal(null); load(); }} />
      )}
      {showBulkRole && (
        <BulkRoleModal count={sel.length} roles={roles} onClose={() => setShowBulkRole(false)} onConfirm={bulkSetRole} />
      )}
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showImport && <ImportModal roles={roles} onClose={() => setShowImport(false)} onDone={load} />}
    </div>
  );
}
