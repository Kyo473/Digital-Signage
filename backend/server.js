require('dotenv').config();
const logger = require('./logger');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { signToken, requireAuth, requirePerm, checkOwnership, setDb, setLogger } = require('./auth');
const { buildWidgetHtml } = require('./widgets');
const webhook = require('./webhook');
const backup  = require('./backup');
setDb(db);
setLogger(logger);
webhook.setDb(db);
webhook.setLogger(logger);
backup.setLogger(logger);

// Инициализируем cron-бекап из БД при старте
{
  const bset = db.prepare('SELECT cron FROM backup_settings WHERE id=1').get();
  if (bset?.cron) {
    const dests = db.prepare('SELECT * FROM backup_destinations WHERE enabled=1').all()
      .map(d => ({ ...d, ...JSON.parse(d.config || '{}') }));
    backup.scheduleCron(bset.cron, dests);
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

// Merge content-level scroll settings into props — content columns are source of truth,
// always override stale values that may have been saved at object-creation time
function parseSceneObj(o) {
  const props = JSON.parse(o.props || '{}');
  if (o.scroll_behavior != null) props.scroll_behavior = o.scroll_behavior;
  if (o.scroll_speed != null) props.scroll_speed = o.scroll_speed;
  return { ...o, props };
}

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(__dirname, process.env.UPLOADS_DIR)
  : path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://localhost:3001'];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // нужно для /uploads
  contentSecurityPolicy: false, // фронт сам управляет CSP
}));
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// ── Request logger ────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path === '/api/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const isDebugPath = req.path === '/api/logs' || (req.method === 'HEAD' && res.statusCode === 401);
    const level = isDebugPath ? 'debug' : res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    const auth = req.headers['authorization'];
    const tokenHint = auth ? auth.slice(7, 27) + '...' : null;
    logger.log(level, 'http', `${req.method} ${req.path} → ${res.statusCode}`, {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms,
      ip: req.ip || req.connection?.remoteAddress,
      token: tokenHint,
      query: Object.keys(req.query).length ? req.query : undefined,
    });
  });
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /image\/(jpeg|jpg|png|gif|webp|svg\+xml|bmp|tiff|tif|avif|heic|heif|x-icon|vnd\.microsoft\.icon)|video\/(mp4|webm|ogg|quicktime|x-msvideo|x-matroska|mpeg)|application\/pdf/;
    cb(null, allowed.test(file.mimetype));
  },
});

// ── Auth ──────────────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const proxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Слишком много запросов к прокси.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function getUserWithPerms(id) {
  const user = db.prepare('SELECT u.id, u.username, u.role_id, r.name AS role_name, r.permissions FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id=?').get(id);
  if (!user) return null;
  user.permissions = JSON.parse(user.permissions || '[]');
  return user;
}

function requireDeviceToken(req, res, next) {
  const token = req.query.token || req.headers['x-device-token'];
  if (!token) return res.status(401).json({ error: 'Device token required' });
  const device = db.prepare('SELECT * FROM devices WHERE device_token=? AND approved=1').get(token);
  if (!device) return res.status(403).json({ error: 'Invalid or unapproved device token' });
  req.device = device;
  next();
}

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const user = db.prepare('SELECT u.*, r.name AS role_name, r.permissions FROM users u JOIN roles r ON r.id = u.role_id WHERE u.username=?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  const permissions = JSON.parse(user.permissions || '[]');
  const token = signToken({ id: user.id, username: user.username, role_id: user.role_id, role_name: user.role_name, permissions });
  res.json({ token, user: { id: user.id, username: user.username, role_id: user.role_id, role_name: user.role_name, permissions } });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = getUserWithPerms(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ── Roles ─────────────────────────────────────────────────────────────────────

app.get('/api/roles', requireAuth, requirePerm('roles.view'), (req, res) => {
  const roles = db.prepare('SELECT * FROM roles ORDER BY created_at ASC').all();
  res.json(roles.map(r => ({ ...r, permissions: JSON.parse(r.permissions || '[]') })));
});

app.post('/api/roles', requireAuth, requirePerm('roles.edit'), (req, res) => {
  const { name, permissions = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO roles (id,name,permissions,is_system) VALUES (?,?,?,0)').run(id, name, JSON.stringify(permissions));
  const role = db.prepare('SELECT * FROM roles WHERE id=?').get(id);
  res.status(201).json({ ...role, permissions: JSON.parse(role.permissions) });
});

app.put('/api/roles/:id', requireAuth, requirePerm('roles.edit'), (req, res) => {
  const role = db.prepare('SELECT * FROM roles WHERE id=?').get(req.params.id);
  if (!role) return res.status(404).json({ error: 'Not found' });
  const { name, permissions } = req.body;
  db.prepare('UPDATE roles SET name=COALESCE(?,name), permissions=COALESCE(?,permissions) WHERE id=?')
    .run(name ?? null, permissions ? JSON.stringify(permissions) : null, req.params.id);
  const updated = db.prepare('SELECT * FROM roles WHERE id=?').get(req.params.id);
  res.json({ ...updated, permissions: JSON.parse(updated.permissions) });
});

app.delete('/api/roles/:id', requireAuth, requirePerm('roles.edit'), (req, res) => {
  const role = db.prepare('SELECT * FROM roles WHERE id=?').get(req.params.id);
  if (!role) return res.status(404).json({ error: 'Not found' });
  if (role.is_system) return res.status(400).json({ error: 'Системные роли нельзя удалять' });
  const inUse = db.prepare('SELECT COUNT(*) as c FROM users WHERE role_id=?').get(req.params.id);
  if (inUse.c > 0) return res.status(400).json({ error: 'Роль используется пользователями' });
  db.prepare('DELETE FROM roles WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Users ─────────────────────────────────────────────────────────────────────

app.get('/api/users', requireAuth, requirePerm('users.view'), (req, res) => {
  const users = db.prepare('SELECT u.id, u.username, u.role_id, u.created_at, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.created_at ASC').all();
  res.json(users);
});

// Экспорт пользователей
app.get('/api/users/export', requireAuth, requirePerm('users.view'), (req, res) => {
  const { format = 'json' } = req.query;
  const users = db.prepare('SELECT u.id, u.username, u.role_id, u.created_at, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.created_at ASC').all();
  if (format === 'csv') {
    const rows = [
      ['id', 'username', 'role_id', 'role_name', 'created_at'].join(','),
      ...users.map(u => [u.id, u.username, u.role_id, u.role_name, new Date(u.created_at * 1000).toISOString()].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    return res.send('﻿' + rows);
  }
  if (format === 'tsv') {
    const rows = [
      ['id', 'username', 'role_id', 'role_name', 'created_at'].join('\t'),
      ...users.map(u => [u.id, u.username, u.role_id, u.role_name, new Date(u.created_at * 1000).toISOString()].join('\t'))
    ].join('\n');
    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users.tsv"');
    return res.send(rows);
  }
  // json (default)
  res.setHeader('Content-Disposition', 'attachment; filename="users.json"');
  res.json(users.map(u => ({ id: u.id, username: u.username, role_id: u.role_id, role_name: u.role_name, created_at: new Date(u.created_at * 1000).toISOString() })));
});

// Импорт пользователей
app.post('/api/users/import', requireAuth, requirePerm('users.create'), (req, res) => {
  const { users: list, on_conflict = 'skip' } = req.body; // on_conflict: skip | update
  if (!Array.isArray(list)) return res.status(400).json({ error: 'users array required' });
  const roles = Object.fromEntries(db.prepare('SELECT id, name FROM roles').all().map(r => [r.id, r]));
  let created = 0, skipped = 0, updated = 0, errors = [];
  for (const u of list) {
    if (!u.username) { errors.push(`Пропущена строка без username`); continue; }
    const role = roles[u.role_id] || Object.values(roles).find(r => r.name === u.role_name);
    if (!role) { errors.push(`Роль не найдена для ${u.username}`); skipped++; continue; }
    const existing = db.prepare('SELECT id FROM users WHERE username=?').get(u.username);
    if (existing) {
      if (on_conflict === 'update') {
        db.prepare('UPDATE users SET role_id=? WHERE id=?').run(role.id, existing.id);
        updated++;
      } else { skipped++; }
      continue;
    }
    const password = u.password || require('crypto').randomBytes(12).toString('base64url');
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (id,username,password_hash,role_id) VALUES (?,?,?,?)').run(uuidv4(), u.username, hash, role.id);
    created++;
  }
  res.json({ created, updated, skipped, errors });
});

app.post('/api/users', requireAuth, requirePerm('users.create'), (req, res) => {
  const { username, password, role_id } = req.body;
  if (!username || !password || !role_id) return res.status(400).json({ error: 'username, password and role_id required' });
  const role = db.prepare('SELECT id FROM roles WHERE id=?').get(role_id);
  if (!role) return res.status(400).json({ error: 'Role not found' });
  const exists = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (exists) return res.status(400).json({ error: 'Пользователь уже существует' });
  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id,username,password_hash,role_id) VALUES (?,?,?,?)').run(id, username, hash, role_id);
  webhook.emit('user.created', { id, username, role_id });
  res.status(201).json({ id, username, role_id });
});

app.put('/api/users/:id', requireAuth, requirePerm('users.edit'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const { username, password, role_id } = req.body;
  if (role_id) {
    const roleExists = db.prepare('SELECT id FROM roles WHERE id=?').get(role_id);
    if (!roleExists) return res.status(400).json({ error: 'Role not found' });
  }
  // Нельзя менять роль единственного администратора
  if (role_id && user.role_id === 'role_admin' && role_id !== 'role_admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role_id='role_admin'").get();
    if (adminCount.c <= 1) return res.status(400).json({ error: 'Нельзя убрать роль у единственного администратора' });
  }
  if (username) db.prepare('UPDATE users SET username=? WHERE id=?').run(username, req.params.id);
  if (password) db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password, 10), req.params.id);
  if (role_id) db.prepare('UPDATE users SET role_id=? WHERE id=?').run(role_id, req.params.id);
  const updated = db.prepare('SELECT u.id, u.username, u.role_id, u.created_at, r.name AS role_name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?').get(req.params.id);
  res.json(updated);
});

app.delete('/api/users/:id', requireAuth, requirePerm('users.delete'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Нельзя удалить себя' });
  const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role_id='role_admin'").get();
  if (user.role_id === 'role_admin' && adminCount.c <= 1)
    return res.status(400).json({ error: 'Нельзя удалить единственного администратора' });
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  webhook.emit('user.deleted', { id: req.params.id });
  res.json({ ok: true });
});

// Массовые действия над пользователями
app.post('/api/users/bulk', requireAuth, requirePerm('users.edit'), (req, res) => {
  const { ids, action, role_id } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids required' });

  if (action === 'set_role') {
    if (!role_id) return res.status(400).json({ error: 'role_id required' });
    const roleExists = db.prepare('SELECT id FROM roles WHERE id=?').get(role_id);
    if (!roleExists) return res.status(400).json({ error: 'Role not found' });
    // Проверяем: не снимаем ли роль admin у единственного администратора
    if (role_id !== 'role_admin') {
      const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role_id='role_admin'").get();
      const affectedAdmins = db.prepare(
        `SELECT COUNT(*) as c FROM users WHERE role_id='role_admin' AND id IN (${ids.map(() => '?').join(',')})`
      ).get(...ids);
      if (affectedAdmins.c >= adminCount.c)
        return res.status(400).json({ error: 'Нельзя убрать роль у всех администраторов' });
    }
    const stmt = db.prepare('UPDATE users SET role_id=? WHERE id=?');
    for (const id of ids) stmt.run(role_id, id);
    return res.json({ ok: true, updated: ids.length });
  }

  if (action === 'delete') {
    if (!req.dbUser?.permissions?.includes('users.delete'))
      return res.status(403).json({ error: 'Недостаточно прав' });
    const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role_id='role_admin'").get();
    const affectedAdmins = db.prepare(
      `SELECT COUNT(*) as c FROM users WHERE role_id='role_admin' AND id IN (${ids.map(() => '?').join(',')})`
    ).get(...ids);
    if (affectedAdmins.c >= adminCount.c)
      return res.status(400).json({ error: 'Нельзя удалить всех администраторов' });
    // Не удаляем себя
    const safeIds = ids.filter(id => id !== req.user.id);
    const stmt = db.prepare('DELETE FROM users WHERE id=?');
    for (const id of safeIds) stmt.run(id);
    return res.json({ ok: true, deleted: safeIds.length });
  }

  res.status(400).json({ error: 'Unknown action' });
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

app.get('/api/dashboard', requireAuth, requirePerm('dashboard.view'), (_req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const onlineThreshold = 30;

  const deviceRows = db.prepare(`
    SELECT d.id, d.code, d.name, d.last_seen, d.approved, d.screen_id,
           s.name AS screen_name
    FROM devices d
    LEFT JOIN screens s ON s.id = d.screen_id
    ORDER BY d.last_seen DESC
  `).all();

  const approved = deviceRows.filter(d => d.approved);
  const pending  = deviceRows.filter(d => !d.approved);
  const online   = approved.filter(d => d.last_seen && (now - d.last_seen) < onlineThreshold);

  const screenRows  = db.prepare('SELECT id, playlist_id, scene_id FROM screens').all();
  const contentRows = db.prepare('SELECT type FROM content').all();
  const playlistCount = db.prepare('SELECT COUNT(*) AS c FROM playlists').get().c;
  const groupCount    = db.prepare('SELECT COUNT(*) AS c FROM device_groups').get().c;

  const byType = {};
  for (const r of contentRows) byType[r.type] = (byType[r.type] || 0) + 1;

  const recentErrors = logger.getLogs({ level: 'warn', limit: 10 })
    .filter(e => e.level === 'error' || e.level === 'warn')
    .slice(0, 10);

  res.json({
    devices: {
      total:   approved.length,
      online:  online.length,
      offline: approved.length - online.length,
      pending: pending.length,
    },
    screens: {
      total:          screenRows.length,
      withContent:    screenRows.filter(s => s.playlist_id || s.scene_id).length,
      withoutContent: screenRows.filter(s => !s.playlist_id && !s.scene_id).length,
    },
    content: {
      total:  contentRows.length,
      byType,
    },
    playlists: { total: playlistCount },
    groups:    { total: groupCount },
    recentErrors,
    deviceList: deviceRows.map(d => ({
      id:          d.id,
      name:        d.name,
      code:        d.code,
      last_seen:   d.last_seen,
      approved:    d.approved,
      screen_name: d.screen_name || null,
    })),
  });
});

// ── Widgets proxy ────────────────────────────────────────────────────────────

const widgetLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Слишком много запросов к виджетам.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/widgets/render?type=clock&p=<base64json>
// No auth — serves widget HTML page directly as iframe src
app.get('/api/widgets/render', widgetLimiter, (req, res) => {
  const { type, p } = req.query;
  if (!type) return res.status(400).send('type required');
  let props = {};
  if (p) {
    try {
      // Accept both standard base64 and base64url (replace - → +, _ → /, restore padding)
      const normalized = p.replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
      const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
      props = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    } catch { /* use defaults */ }
  }
  const html = buildWidgetHtml(type, props);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
});

// GET /api/widgets/weather?city=Moscow&apikey=XXX&units=metric&lang=ru
// No auth required — called from iframes inside scene widgets
app.get('/api/widgets/weather', widgetLimiter, async (req, res) => {
  const { city, lat, lon, apikey, units = 'metric', lang = 'ru' } = req.query;
  if (!apikey) return res.status(400).json({ error: 'apikey required' });
  if (!city && (!lat || !lon)) return res.status(400).json({ error: 'city or lat+lon required' });
  try {
    let finalLat = lat, finalLon = lon;
    // Geocode city name → lat/lon via OWM Geocoding API
    if (city) {
      const geoUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city.trim())}&limit=1&appid=${encodeURIComponent(apikey)}`;
      const gr = await fetch(geoUrl, { signal: AbortSignal.timeout(8000) });
      const gd = await gr.json();
      if (!gr.ok) return res.status(gr.status).json({ error: gd.message || 'Geocoding error' });
      if (!Array.isArray(gd) || gd.length === 0) return res.status(404).json({ error: 'Город не найден' });
      finalLat = gd[0].lat;
      finalLon = gd[0].lon;
    }
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${finalLat}&lon=${finalLon}&appid=${encodeURIComponent(apikey)}&units=${units}&lang=${lang}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message || 'Weather API error' });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'Weather API unavailable: ' + e.message });
  }
});

// GET /api/widgets/currency — курсы ЦБ РФ (не требует ключа)
// No auth required — called from iframes inside scene widgets
app.get('/api/widgets/currency', widgetLimiter, async (_req, res) => {
  try {
    const r = await fetch('https://www.cbr-xml-daily.ru/daily_json.js', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return res.status(r.status).json({ error: 'CBR API error' });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'CBR API unavailable: ' + e.message });
  }
});

// ── Content ──────────────────────────────────────────────────────────────────

app.get('/api/content', requireAuth, requirePerm('content.view'), (req, res) => {
  const rows = db.prepare('SELECT * FROM content ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/api/content/upload', requireAuth, requirePerm('content.create'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file or unsupported type' });
  const { name, duration = 10, page_duration = 5, muted = 1 } = req.body;
  const mime = req.file.mimetype;
  const type = mime === 'application/pdf' ? 'pdf' : mime.startsWith('video/') ? 'video' : 'image';
  const id = uuidv4();
  const url = `/uploads/${req.file.filename}`;
  db.prepare('INSERT INTO content (id,name,type,url,filename,duration,page_duration,muted,created_by) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, name || req.file.originalname, type, url, req.file.filename, Number(duration), Number(page_duration), Number(muted), req.user.id);
  const content = db.prepare('SELECT * FROM content WHERE id=?').get(id);
  webhook.emit('content.created', content);
  res.status(201).json(content);
});

app.post('/api/content/webpage', requireAuth, requirePerm('content.create'), (req, res) => {
  const { name, url, scroll_behavior = 'none', scroll_speed = 100, scroll_duration = 30 } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  const id = uuidv4();
  db.prepare('INSERT INTO content (id,name,type,url,scroll_behavior,scroll_speed,scroll_duration,created_by) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, name, 'webpage', url, scroll_behavior, Number(scroll_speed), Number(scroll_duration), req.user.id);
  const content = db.prepare('SELECT * FROM content WHERE id=?').get(id);
  webhook.emit('content.created', content);
  res.status(201).json(content);
});

app.post('/api/content/html', requireAuth, requirePerm('content.create'), (req, res) => {
  const { name, html, scroll_behavior = 'none', scroll_speed = 100, scroll_duration = 30 } = req.body;
  if (!name || !html) return res.status(400).json({ error: 'name and html required' });
  const id = uuidv4();
  db.prepare('INSERT INTO content (id,name,type,html,scroll_behavior,scroll_speed,scroll_duration,created_by) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, name, 'html', html, scroll_behavior, Number(scroll_speed), Number(scroll_duration), req.user.id);
  const content = db.prepare('SELECT * FROM content WHERE id=?').get(id);
  webhook.emit('content.created', content);
  res.status(201).json(content);
});

app.put('/api/content/:id', requireAuth, requirePerm('content.edit_any'), (req, res) => {
  const { name, duration, url, html, page_duration, scroll_behavior, scroll_speed, scroll_duration, muted } = req.body;
  const item = db.prepare('SELECT * FROM content WHERE id=?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (!checkOwnership(req, res, item.created_by)) return;
  db.prepare(`UPDATE content SET
    name=COALESCE(?,name),
    duration=COALESCE(?,duration),
    url=COALESCE(?,url),
    html=COALESCE(?,html),
    page_duration=COALESCE(?,page_duration),
    scroll_behavior=COALESCE(?,scroll_behavior),
    scroll_speed=COALESCE(?,scroll_speed),
    scroll_duration=COALESCE(?,scroll_duration),
    muted=COALESCE(?,muted)
    WHERE id=?`)
    .run(name ?? null, duration ?? null, url ?? null, html ?? null,
         page_duration ?? null, scroll_behavior ?? null, scroll_speed ?? null,
         scroll_duration ?? null, muted ?? null, req.params.id);
  res.json(db.prepare('SELECT * FROM content WHERE id=?').get(req.params.id));
});

app.delete('/api/content/:id', requireAuth, requirePerm('content.delete_any'), (req, res) => {
  const item = db.prepare('SELECT * FROM content WHERE id=?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (!checkOwnership(req, res, item.created_by)) return;
  if (item.filename) {
    const filePath = path.resolve(UPLOADS_DIR, item.filename);
    if (!filePath.startsWith(path.resolve(UPLOADS_DIR))) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.prepare('DELETE FROM content WHERE id=?').run(req.params.id);
  webhook.emit('content.deleted', { id: req.params.id });
  res.json({ ok: true });
});

// ── Playlists ─────────────────────────────────────────────────────────────────

app.get('/api/playlists', requireAuth, requirePerm('playlists.view'), (req, res) => {
  const playlists = db.prepare('SELECT * FROM playlists ORDER BY created_at DESC').all();
  res.json(playlists);
});

app.post('/api/playlists', requireAuth, requirePerm('playlists.create'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO playlists (id,name,created_by) VALUES (?,?,?)').run(id, name, req.user.id);
  const playlist = db.prepare('SELECT * FROM playlists WHERE id=?').get(id);
  webhook.emit('playlist.created', playlist);
  res.status(201).json(playlist);
});

app.get('/api/playlists/:id', requireAuth, requirePerm('playlists.view'), (req, res) => {
  const playlist = db.prepare('SELECT * FROM playlists WHERE id=?').get(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Not found' });
  const rows = db.prepare(`
    SELECT pi.id AS id, pi.position, pi.duration_override, pi.start_time,
           pi.content_id, pi.scene_id,
           c.name, c.type, c.url, c.html, c.filename,
           c.duration, c.scroll_behavior, c.scroll_speed, c.scroll_duration, c.page_duration, c.muted,
           s.name AS scene_name
    FROM playlist_items pi
    LEFT JOIN content c ON c.id = pi.content_id
    LEFT JOIN scenes s ON s.id = pi.scene_id
    WHERE pi.playlist_id = ?
    ORDER BY pi.start_time, pi.position
  `).all(req.params.id);
  const items = rows.map(r => ({
    ...r,
    name: r.name ?? r.scene_name ?? 'Без названия',
    type: r.type ?? 'scene',
  }));
  res.json({ ...playlist, items });
});

app.put('/api/playlists/:id', requireAuth, requirePerm('playlists.edit_any'), (req, res) => {
  const pl = db.prepare('SELECT * FROM playlists WHERE id=?').get(req.params.id);
  if (!pl) return res.status(404).json({ error: 'Not found' });
  if (!checkOwnership(req, res, pl.created_by)) return;
  const { name } = req.body;
  db.prepare('UPDATE playlists SET name=COALESCE(?,name) WHERE id=?').run(name ?? null, req.params.id);
  const updated = db.prepare('SELECT * FROM playlists WHERE id=?').get(req.params.id);
  webhook.emit('playlist.updated', updated);
  res.json(updated);
});

app.delete('/api/playlists/:id', requireAuth, requirePerm('playlists.delete_any'), (req, res) => {
  const pl = db.prepare('SELECT * FROM playlists WHERE id=?').get(req.params.id);
  if (!pl) return res.status(404).json({ error: 'Not found' });
  if (!checkOwnership(req, res, pl.created_by)) return;
  db.prepare('DELETE FROM playlists WHERE id=?').run(req.params.id);
  webhook.emit('playlist.deleted', { id: req.params.id });
  res.json({ ok: true });
});

app.post('/api/playlists/:id/items', requireAuth, requirePerm('playlists.edit_any'), (req, res) => {
  const { content_id, scene_id, duration_override } = req.body;
  if (!content_id && !scene_id) return res.status(400).json({ error: 'content_id or scene_id required' });
  const maxPos = db.prepare('SELECT MAX(position) as m FROM playlist_items WHERE playlist_id=?').get(req.params.id);
  const position = (maxPos.m ?? -1) + 1;
  // Auto-place after last item; for smooth-scroll content derive duration from scroll_speed
  const last = db.prepare(`
    SELECT pi.start_time,
           CASE
             WHEN c.scroll_behavior = 'smooth'
               THEN CAST(CEIL(30.0 * 850 * 100.0 / COALESCE(c.scroll_speed, 100) / 1000) AS INTEGER)
             ELSE COALESCE(pi.duration_override, c.duration, 10)
           END AS dur
    FROM playlist_items pi
    LEFT JOIN content c ON c.id = pi.content_id
    WHERE pi.playlist_id = ?
    ORDER BY pi.start_time DESC, pi.position DESC LIMIT 1
  `).get(req.params.id);
  const start_time = last ? (last.start_time + last.dur) : 0;
  const id = uuidv4();
  db.prepare('INSERT INTO playlist_items (id,playlist_id,content_id,scene_id,position,duration_override,start_time) VALUES (?,?,?,?,?,?,?)')
    .run(id, req.params.id, content_id ?? null, scene_id ?? null, position, duration_override ?? null, start_time);
  res.status(201).json({ id });
});

app.put('/api/playlists/:id/items/reorder', requireAuth, requirePerm('playlists.edit_any'), (req, res) => {
  const { items } = req.body;
  const update = db.prepare('UPDATE playlist_items SET position=?, start_time=? WHERE id=? AND playlist_id=?');
  const tx = db.transaction(() => items.forEach(i => update.run(i.position, i.start_time ?? 0, i.id, req.params.id)));
  tx();
  res.json({ ok: true });
});

app.put('/api/playlists/:id/items/:iid', requireAuth, requirePerm('playlists.edit_any'), (req, res) => {
  const { duration_override, start_time, position } = req.body;
  db.prepare('UPDATE playlist_items SET duration_override=COALESCE(?,duration_override), start_time=COALESCE(?,start_time), position=COALESCE(?,position) WHERE id=? AND playlist_id=?')
    .run(duration_override ?? null, start_time ?? null, position ?? null, req.params.iid, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/playlists/:pid/items/:iid', requireAuth, requirePerm('playlists.edit_any'), (req, res) => {
  db.prepare('DELETE FROM playlist_items WHERE id=? AND playlist_id=?').run(req.params.iid, req.params.pid);
  res.json({ ok: true });
});

// Duplicate playlist
app.post('/api/playlists/:id/duplicate', requireAuth, requirePerm('playlists.create'), (req, res) => {
  const src = db.prepare('SELECT * FROM playlists WHERE id=?').get(req.params.id);
  if (!src) return res.status(404).json({ error: 'Not found' });
  const newId = uuidv4();
  db.prepare('INSERT INTO playlists (id,name,created_by) VALUES (?,?,?)')
    .run(newId, `${src.name} (копия)`, req.user.id);
  const items = db.prepare('SELECT * FROM playlist_items WHERE playlist_id=? ORDER BY position ASC').all(req.params.id);
  const ins = db.prepare('INSERT INTO playlist_items (id,playlist_id,content_id,scene_id,position,start_time,duration_override) VALUES (?,?,?,?,?,?,?)');
  for (const it of items) {
    ins.run(uuidv4(), newId, it.content_id || null, it.scene_id || null, it.position, it.start_time ?? 0, it.duration_override ?? null);
  }
  res.status(201).json(db.prepare('SELECT * FROM playlists WHERE id=?').get(newId));
});

// ── Playlist versions ─────────────────────────────────────────────────────────

function pruneVersions(table, entityField, entityId, max = 5) {
  const rows = db.prepare(`SELECT id FROM ${table} WHERE ${entityField}=? ORDER BY version_num ASC`).all(entityId);
  if (rows.length > max) {
    const toDelete = rows.slice(0, rows.length - max);
    const del = db.prepare(`DELETE FROM ${table} WHERE id=?`);
    for (const r of toDelete) del.run(r.id);
  }
}

app.get('/api/playlists/:id/versions', requireAuth, requirePerm('playlists.view'), (req, res) => {
  const playlist = db.prepare('SELECT id FROM playlists WHERE id=?').get(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Not found' });
  const versions = db.prepare(
    'SELECT id, playlist_id, version_num, label, created_at, created_by FROM playlist_versions WHERE playlist_id=? ORDER BY version_num DESC'
  ).all(req.params.id);
  res.json(versions);
});

app.post('/api/playlists/:id/versions', requireAuth, requirePerm('playlists.versions'), (req, res) => {
  const playlist = db.prepare('SELECT * FROM playlists WHERE id=?').get(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Not found' });

  const items = db.prepare(
    'SELECT id, content_id, scene_id, position, start_time, duration_override FROM playlist_items WHERE playlist_id=? ORDER BY position ASC'
  ).all(req.params.id);

  const maxNum = db.prepare('SELECT MAX(version_num) AS m FROM playlist_versions WHERE playlist_id=?').get(req.params.id);
  const version_num = (maxNum?.m ?? 0) + 1;
  const { label } = req.body || {};
  const id = uuidv4();

  db.prepare('INSERT INTO playlist_versions (id,playlist_id,version_num,label,snapshot,created_by) VALUES (?,?,?,?,?,?)')
    .run(id, req.params.id, version_num, label || null, JSON.stringify(items), req.user.id);

  pruneVersions('playlist_versions', 'playlist_id', req.params.id);
  res.status(201).json(db.prepare('SELECT id,playlist_id,version_num,label,created_at,created_by FROM playlist_versions WHERE id=?').get(id));
});

app.post('/api/playlists/:id/versions/:vid/restore', requireAuth, requirePerm('playlists.versions'), (req, res) => {
  const version = db.prepare('SELECT * FROM playlist_versions WHERE id=? AND playlist_id=?').get(req.params.vid, req.params.id);
  if (!version) return res.status(404).json({ error: 'Version not found' });

  const items = JSON.parse(version.snapshot);
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM playlist_items WHERE playlist_id=?').run(req.params.id);
    const ins = db.prepare(
      'INSERT INTO playlist_items (id,playlist_id,content_id,scene_id,position,start_time,duration_override) VALUES (?,?,?,?,?,?,?)'
    );
    for (const it of items) {
      ins.run(it.id, req.params.id, it.content_id || null, it.scene_id || null, it.position, it.start_time ?? 0, it.duration_override ?? null);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  // Return full playlist (same as GET /api/playlists/:id)
  const playlist = db.prepare('SELECT * FROM playlists WHERE id=?').get(req.params.id);
  const rows = db.prepare(`
    SELECT pi.id AS id, pi.position, pi.duration_override, pi.start_time,
           pi.content_id, pi.scene_id,
           c.name, c.type, c.url, c.html, c.filename,
           c.duration, c.scroll_behavior, c.scroll_speed, c.scroll_duration, c.page_duration, c.muted,
           s.name AS scene_name
    FROM playlist_items pi
    LEFT JOIN content c ON c.id = pi.content_id
    LEFT JOIN scenes s ON s.id = pi.scene_id
    WHERE pi.playlist_id = ?
    ORDER BY pi.position ASC
  `).all(req.params.id);
  res.json({ ...playlist, items: rows });
});

app.delete('/api/playlists/:id/versions/:vid', requireAuth, requirePerm('playlists.versions'), (req, res) => {
  const version = db.prepare('SELECT id FROM playlist_versions WHERE id=? AND playlist_id=?').get(req.params.vid, req.params.id);
  if (!version) return res.status(404).json({ error: 'Version not found' });
  db.prepare('DELETE FROM playlist_versions WHERE id=?').run(req.params.vid);
  res.json({ ok: true });
});

// ── Screens ───────────────────────────────────────────────────────────────────

app.get('/api/screens', requireAuth, requirePerm('screens.view'), (req, res) => {
  res.json(db.prepare('SELECT * FROM screens ORDER BY created_at DESC').all());
});

app.post('/api/screens', requireAuth, requirePerm('screens.create'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO screens (id,name,created_by) VALUES (?,?,?)').run(id, name, req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM screens WHERE id=?').get(id));
});

app.put('/api/screens/:id', requireAuth, requirePerm('screens.edit_any'), (req, res) => {
  const screen = db.prepare('SELECT * FROM screens WHERE id=?').get(req.params.id);
  if (!screen) return res.status(404).json({ error: 'Not found' });
  if (!checkOwnership(req, res, screen.created_by)) return;
  const { name, playlist_id, scene_id } = req.body;
  db.prepare('UPDATE screens SET name=COALESCE(?,name), playlist_id=?, scene_id=? WHERE id=?')
    .run(name ?? null, playlist_id ?? null, scene_id ?? null, req.params.id);
  const updated = db.prepare('SELECT * FROM screens WHERE id=?').get(req.params.id);
  webhook.emit('screen.updated', updated);
  res.json(updated);
});

app.delete('/api/screens/:id', requireAuth, requirePerm('screens.delete_any'), (req, res) => {
  const screen = db.prepare('SELECT * FROM screens WHERE id=?').get(req.params.id);
  if (!screen) return res.status(404).json({ error: 'Not found' });
  if (!checkOwnership(req, res, screen.created_by)) return;
  db.prepare('DELETE FROM screens WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Команда управления плеером (pause / resume / next / prev)
app.post('/api/screens/:id/command', requireAuth, requirePerm('screens.edit_any'), (req, res) => {
  const { command } = req.body;
  if (!['pause', 'resume', 'next', 'prev'].includes(command))
    return res.status(400).json({ error: 'command must be pause | resume | next | prev' });
  db.prepare('UPDATE screens SET command=? WHERE id=?').run(command, req.params.id);
  res.json({ ok: true });
});

// Лёгкий endpoint для быстрого polling команды из плеера
// Принимает device token (APK) или JWT (браузерный плеер)
app.get('/api/screens/:id/command', (req, res) => {
  const deviceToken = req.query.token || req.headers['x-device-token'];
  const authHeader = req.headers['authorization'];

  if (deviceToken) {
    // APK: проверяем device token
    const device = db.prepare('SELECT * FROM devices WHERE device_token=? AND approved=1').get(deviceToken);
    if (!device) return res.status(403).json({ error: 'Invalid or unapproved device token' });
    if (device.screen_id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    // Браузер: проверяем JWT
    const jwt = require('jsonwebtoken');
    try {
      jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Токен недействителен или истёк' });
    }
  } else {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const screen = db.prepare('SELECT id, command FROM screens WHERE id=?').get(req.params.id);
  if (!screen) return res.status(404).json({ error: 'Screen not found' });
  const command = screen.command ?? null;
  if (command) db.prepare('UPDATE screens SET command=NULL WHERE id=?').run(screen.id);
  res.json({ command });
});

// Плеер получает плейлист для экрана
app.get('/api/screens/:id/playlist', (req, res) => {
  const screen = db.prepare('SELECT * FROM screens WHERE id=?').get(req.params.id);
  if (!screen) return res.status(404).json({ error: 'Screen not found' });

  // Direct scene assigned — wrap it as a single playlist item
  if (!screen.playlist_id && screen.scene_id) {
    const scene = db.prepare('SELECT * FROM scenes WHERE id=?').get(screen.scene_id);
    if (!scene) return res.json({ items: [] });
    const objs = db.prepare(`
      SELECT so.*,
             COALESCE(c.name, so.name) AS name,
             COALESCE(c.type, so.type) AS type,
             COALESCE(c.url,  so.url)  AS url,
             c.html, c.filename,
             c.scroll_behavior, c.scroll_speed, c.scroll_duration, c.page_duration, c.muted
      FROM scene_objects so
      LEFT JOIN content c ON c.id = so.content_id
      WHERE so.scene_id = ? AND COALESCE(c.type, so.type) != 'group'
      ORDER BY so.z
    `).all(scene.id);
    return res.json({
      screen,
      items: [{
        id: scene.id,
        type: 'scene',
        name: scene.name,
        duration: scene.duration ?? 30,
        duration_override: null,
        scene_id: scene.id,
        scene_width: scene.width,
        scene_height: scene.height,
        scene_duration: scene.duration ?? 30,
        scene_objects: objs.map(parseSceneObj),
      }],
    });
  }

  if (!screen.playlist_id) return res.json({ items: [] });

  const rows = db.prepare(`
    SELECT pi.id AS id, pi.position, pi.duration_override, pi.start_time,
           pi.content_id, pi.scene_id,
           c.name, c.type, c.url, c.html, c.filename,
           c.duration, c.scroll_behavior, c.scroll_speed, c.scroll_duration, c.page_duration, c.muted,
           s.name AS scene_name, s.width AS scene_width, s.height AS scene_height,
           s.duration AS scene_duration
    FROM playlist_items pi
    LEFT JOIN content c ON c.id = pi.content_id
    LEFT JOIN scenes s ON s.id = pi.scene_id
    WHERE pi.playlist_id = ?
    ORDER BY pi.start_time, pi.position
  `).all(screen.playlist_id);

  // For scene items, load their objects
  const sceneIds = [...new Set(rows.filter(r => r.scene_id).map(r => r.scene_id))];
  const sceneObjects = {};
  for (const sid of sceneIds) {
    const objs = db.prepare(`
      SELECT so.*,
             COALESCE(c.name, so.name) AS name,
             COALESCE(c.type, so.type) AS type,
             COALESCE(c.url,  so.url)  AS url,
             c.html, c.filename,
             c.scroll_behavior, c.scroll_speed, c.scroll_duration, c.page_duration, c.muted
      FROM scene_objects so
      LEFT JOIN content c ON c.id = so.content_id
      WHERE so.scene_id = ? AND COALESCE(c.type, so.type) != 'group'
      ORDER BY so.z
    `).all(sid);
    sceneObjects[sid] = objs.map(parseSceneObj);
  }

  const items = rows.map(r => ({
    ...r,
    name: r.name ?? r.scene_name ?? 'Без названия',
    type: r.type ?? 'scene',
    scene_objects: r.scene_id ? (sceneObjects[r.scene_id] ?? []) : undefined,
    scene_duration: r.scene_id ? (r.scene_duration ?? 30) : undefined,
  }));

  res.json({ screen, items });
});

// ── Devices ───────────────────────────────────────────────────────────────────

// Register or heartbeat a device by short code.
// On first registration device is pending (approved=0). Admin must approve it.
// Returns { id, code, name, approved, token } — token is null until approved.
app.post('/api/devices/register', (req, res) => {
  const { code, name } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });

  let device = db.prepare('SELECT * FROM devices WHERE code=?').get(code);
  if (!device) {
    const id = uuidv4();
    db.prepare('INSERT INTO devices (id,code,name,approved,device_token) VALUES (?,?,?,0,NULL)')
      .run(id, code, name || code);
    device = db.prepare('SELECT * FROM devices WHERE id=?').get(id);
    webhook.emit('device.online', { id: device.id, code: device.code, name: device.name });
  } else {
    db.prepare('UPDATE devices SET last_seen=unixepoch(), name=COALESCE(?,name) WHERE id=?')
      .run(name || null, device.id);
    device = db.prepare('SELECT * FROM devices WHERE id=?').get(device.id);
  }

  res.json({
    id: device.id,
    code: device.code,
    name: device.name,
    approved: device.approved === 1,
    token: device.approved === 1 ? device.device_token : null,
  });
});

// Approve device — generates device_token and marks approved=1
app.post('/api/devices/:id/approve', requireAuth, requirePerm('devices.approve'), (req, res) => {
  const device = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Not found' });
  if (device.approved) return res.json({ id: device.id, code: device.code, name: device.name, approved: true, already: true });

  const token = require('crypto').randomBytes(32).toString('hex');
  db.prepare('UPDATE devices SET approved=1, device_token=? WHERE id=?').run(token, device.id);
  const updated = db.prepare('SELECT * FROM devices WHERE id=?').get(device.id);
  webhook.emit('device.approved', { id: updated.id, code: updated.code, name: updated.name });
  res.json({ id: updated.id, code: updated.code, name: updated.name, approved: true });
});

// Revoke device token — device goes back to pending state
app.post('/api/devices/:id/revoke', requireAuth, requirePerm('devices.approve'), (req, res) => {
  const device = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE devices SET approved=0, device_token=NULL WHERE id=?').run(device.id);
  res.json({ ok: true });
});

// Poll for assigned screen (device calls this every few seconds)
app.get('/api/devices/:id/screen', requireDeviceToken, (req, res) => {
  if (req.device.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('UPDATE devices SET last_seen=unixepoch() WHERE id=?').run(req.params.id);
  res.json({ screen_id: req.device.screen_id });
});

app.get('/api/devices', requireAuth, requirePerm('devices.view'), (req, res) => {
  const devices = db.prepare(`
    SELECT d.id, d.code, d.name, d.screen_id, d.last_seen, d.created_at, d.approved, d.group_id,
           s.name AS screen_name
    FROM devices d
    LEFT JOIN screens s ON s.id = d.screen_id
    ORDER BY d.created_at ASC
  `).all();
  res.json(devices);
});

app.put('/api/devices/:id', requireAuth, requirePerm('devices.manage'), (req, res) => {
  const { screen_id, name } = req.body;
  const sid = screen_id === undefined ? undefined : (screen_id || null);
  if (sid !== undefined && name === undefined) {
    db.prepare('UPDATE devices SET screen_id=? WHERE id=?').run(sid, req.params.id);
  } else if (sid === undefined && name !== undefined) {
    db.prepare('UPDATE devices SET name=? WHERE id=?').run(name || null, req.params.id);
  } else {
    db.prepare('UPDATE devices SET screen_id=?, name=COALESCE(?,name) WHERE id=?')
      .run(sid, name ?? null, req.params.id);
  }
  res.json(db.prepare('SELECT id, code, name, screen_id, last_seen, created_at, approved, group_id FROM devices WHERE id=?').get(req.params.id));
});

app.delete('/api/devices/:id', requireAuth, requirePerm('devices.manage'), (req, res) => {
  db.prepare('DELETE FROM devices WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Ручное управление TV — команда сохраняется в памяти, APK забирает и сбрасывает
const tvCommands = new Map(); // device_id → 'on' | 'off'

app.post('/api/devices/:id/tv-command', requireAuth, requirePerm('devices.manage'), (req, res) => {
  const { command } = req.body;
  if (command !== 'on' && command !== 'off') return res.status(400).json({ error: 'command must be on or off' });
  tvCommands.set(req.params.id, command);
  res.json({ ok: true });
});

// APK опрашивает этот эндпоинт — получает команду и сбрасывает её
app.get('/api/devices/:id/tv-command', requireDeviceToken, (req, res) => {
  if (req.device.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });
  const command = tvCommands.get(req.params.id) ?? null;
  if (command) tvCommands.delete(req.params.id);
  res.json({ command });
});

// ── Schedules ─────────────────────────────────────────────────────────────────

app.get('/api/schedules', requireAuth, requirePerm('devices.view'), (_req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.device_id, s.group_id,
           d.name AS device_name, d.code AS device_code,
           g.name AS group_name,
           s.enabled, s.days, s.on_time, s.off_time
    FROM schedules s
    LEFT JOIN devices d ON d.id = s.device_id
    LEFT JOIN device_groups g ON g.id = s.group_id
    ORDER BY s.created_at DESC
  `).all();
  res.json(rows);
});

app.get('/api/schedules/device/:deviceId', requireAuth, requirePerm('devices.view'), (req, res) => {
  const row = db.prepare(`
    SELECT s.id, s.device_id, d.name AS device_name, d.code AS device_code,
           s.enabled, s.days, s.on_time, s.off_time
    FROM schedules s
    JOIN devices d ON d.id = s.device_id
    WHERE s.device_id = ?
    ORDER BY s.created_at DESC
  `).get(req.params.deviceId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.post('/api/schedules', requireAuth, requirePerm('devices.manage'), (req, res) => {
  const { device_id, group_id, days = '1111111', on_time = '08:00', off_time = '22:00', enabled = 1 } = req.body;
  if (!device_id && !group_id) return res.status(400).json({ error: 'device_id or group_id required' });
  if (group_id) db.prepare('DELETE FROM schedules WHERE group_id=?').run(group_id);
  const id = uuidv4();
  db.prepare('INSERT INTO schedules (id,device_id,group_id,enabled,days,on_time,off_time) VALUES (?,?,?,?,?,?,?)')
    .run(id, device_id || null, group_id || null, enabled ? 1 : 0, days, on_time, off_time);
  res.status(201).json(db.prepare('SELECT * FROM schedules WHERE id=?').get(id));
});

app.put('/api/schedules/:id', requireAuth, requirePerm('devices.manage'), (req, res) => {
  const sch = db.prepare('SELECT * FROM schedules WHERE id=?').get(req.params.id);
  if (!sch) return res.status(404).json({ error: 'Not found' });
  const { days, on_time, off_time, enabled } = req.body;
  db.prepare(`UPDATE schedules SET
    days=COALESCE(?,days),
    on_time=COALESCE(?,on_time),
    off_time=COALESCE(?,off_time),
    enabled=COALESCE(?,enabled)
    WHERE id=?`)
    .run(days ?? null, on_time ?? null, off_time ?? null,
         enabled !== undefined ? (enabled ? 1 : 0) : null, req.params.id);
  res.json(db.prepare('SELECT * FROM schedules WHERE id=?').get(req.params.id));
});

app.delete('/api/schedules/:id', requireAuth, requirePerm('devices.manage'), (req, res) => {
  db.prepare('DELETE FROM schedules WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// APK endpoint — returns schedule for a device (group schedule takes priority)
app.get('/api/devices/:id/schedule', requireDeviceToken, (req, res) => {
  if (req.device.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });
  const device = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id);
  if (!device) return res.json({ enabled: false });
  let sch = null;
  if (device.group_id) {
    sch = db.prepare('SELECT * FROM schedules WHERE group_id=?').get(device.group_id);
  }
  if (!sch) {
    sch = db.prepare('SELECT * FROM schedules WHERE device_id=?').get(req.params.id);
  }
  if (!sch) return res.json({ enabled: false });
  res.json({ enabled: sch.enabled === 1, days: sch.days, on_time: sch.on_time, off_time: sch.off_time });
});

// ── Device Groups ─────────────────────────────────────────────────────────────

app.get('/api/groups', requireAuth, requirePerm('groups.view'), (_req, res) => {
  const groups = db.prepare('SELECT * FROM device_groups ORDER BY created_at DESC').all();
  const result = groups.map(g => {
    const members = db.prepare(`
      SELECT d.id, d.name, d.code, d.screen_id, d.last_seen, d.group_id
      FROM devices d
      WHERE d.group_id = ?
    `).all(g.id);
    const schedule = db.prepare('SELECT * FROM schedules WHERE group_id=?').get(g.id) || null;
    return { ...g, members, schedule };
  });
  res.json(result);
});

app.post('/api/groups', requireAuth, requirePerm('groups.create'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO device_groups (id, name, created_by) VALUES (?, ?, ?)').run(id, name, req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM device_groups WHERE id=?').get(id));
});

app.put('/api/groups/:id', requireAuth, requirePerm('groups.edit_any'), (req, res) => {
  const g = db.prepare('SELECT * FROM device_groups WHERE id=?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (!checkOwnership(req, res, g.created_by)) return;
  const { name, screen_id } = req.body;
  db.prepare('UPDATE device_groups SET name=COALESCE(?,name), screen_id=? WHERE id=?')
    .run(name ?? null, screen_id !== undefined ? (screen_id || null) : g.screen_id, req.params.id);
  if (screen_id !== undefined) {
    db.prepare('UPDATE devices SET screen_id=? WHERE group_id=?')
      .run(screen_id || null, req.params.id);
  }
  res.json(db.prepare('SELECT * FROM device_groups WHERE id=?').get(req.params.id));
});

app.delete('/api/groups/:id', requireAuth, requirePerm('groups.delete_any'), (req, res) => {
  const g = db.prepare('SELECT * FROM device_groups WHERE id=?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (!checkOwnership(req, res, g.created_by)) return;
  db.prepare('DELETE FROM device_groups WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/groups/:id/members', requireAuth, requirePerm('groups.edit_any'), (req, res) => {
  const { device_id } = req.body;
  if (!device_id) return res.status(400).json({ error: 'device_id required' });
  db.prepare('UPDATE devices SET group_id=? WHERE id=?').run(req.params.id, device_id);
  res.json({ ok: true });
});

app.delete('/api/groups/:id/members/:deviceId', requireAuth, requirePerm('groups.edit_any'), (req, res) => {
  db.prepare('UPDATE devices SET group_id=NULL WHERE id=? AND group_id=?')
    .run(req.params.deviceId, req.params.id);
  res.json({ ok: true });
});

app.post('/api/groups/:id/tv-command', requireAuth, requirePerm('devices.manage'), (req, res) => {
  const { command } = req.body;
  if (command !== 'on' && command !== 'off') return res.status(400).json({ error: 'invalid command' });
  const members = db.prepare('SELECT id FROM devices WHERE group_id=?').all(req.params.id);
  members.forEach(d => tvCommands.set(d.id, command));
  res.json({ ok: true, count: members.length });
});

// ── Scenes ────────────────────────────────────────────────────────────────────

app.get('/api/scenes', requireAuth, requirePerm('scenes.view'), (_req, res) => {
  res.json(db.prepare('SELECT * FROM scenes ORDER BY created_at DESC').all());
});

app.post('/api/scenes', requireAuth, requirePerm('scenes.create'), (req, res) => {
  const { name, width = 1920, height = 1080 } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO scenes (id,name,width,height,created_by) VALUES (?,?,?,?,?)').run(id, name, width, height, req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM scenes WHERE id=?').get(id));
});

app.get('/api/scenes/:id', requireAuth, requirePerm('scenes.view'), (req, res) => {
  const scene = db.prepare('SELECT * FROM scenes WHERE id=?').get(req.params.id);
  if (!scene) return res.status(404).json({ error: 'Not found' });
  const objects = db.prepare(`
    SELECT so.*,
           COALESCE(c.name, so.name) AS name,
           COALESCE(c.type, so.type) AS type,
           COALESCE(c.url,  so.url)  AS url,
           c.html, c.filename,
           c.scroll_behavior, c.scroll_speed, c.scroll_duration, c.page_duration, c.muted
    FROM scene_objects so
    LEFT JOIN content c ON c.id = so.content_id
    WHERE so.scene_id = ?
    ORDER BY so.z
  `).all(req.params.id);
  res.json({ ...scene, objects: objects.map(parseSceneObj) });
});

app.put('/api/scenes/:id', requireAuth, requirePerm('scenes.edit_any'), (req, res) => {
  const scene = db.prepare('SELECT * FROM scenes WHERE id=?').get(req.params.id);
  if (!scene) return res.status(404).json({ error: 'Not found' });
  if (!checkOwnership(req, res, scene.created_by)) return;
  const { name, width, height, duration } = req.body;
  db.prepare('UPDATE scenes SET name=COALESCE(?,name), width=COALESCE(?,width), height=COALESCE(?,height), duration=COALESCE(?,duration) WHERE id=?')
    .run(name ?? null, width ?? null, height ?? null, duration ?? null, req.params.id);
  res.json(db.prepare('SELECT * FROM scenes WHERE id=?').get(req.params.id));
});

app.delete('/api/scenes/:id', requireAuth, requirePerm('scenes.delete_any'), (req, res) => {
  const scene = db.prepare('SELECT * FROM scenes WHERE id=?').get(req.params.id);
  if (!scene) return res.status(404).json({ error: 'Not found' });
  if (!checkOwnership(req, res, scene.created_by)) return;
  db.prepare('DELETE FROM scenes WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Scene objects CRUD
app.post('/api/scenes/:id/objects', requireAuth, requirePerm('scenes.edit_any'), (req, res) => {
  const { content_id, x = 0, y = 0, w = 960, h = 540, z = 0, props = {} } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO scene_objects (id,scene_id,content_id,x,y,w,h,z,props) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, req.params.id, content_id ?? null, x, y, w, h, z, JSON.stringify(props));
  res.status(201).json({ id });
});

app.put('/api/scenes/:id/objects/:oid', requireAuth, requirePerm('scenes.edit_any'), (req, res) => {
  const { x, y, w, h, z, props } = req.body;
  const cur = db.prepare('SELECT * FROM scene_objects WHERE id=? AND scene_id=?').get(req.params.oid, req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE scene_objects SET x=?,y=?,w=?,h=?,z=?,props=? WHERE id=?')
    .run(
      x ?? cur.x, y ?? cur.y, w ?? cur.w, h ?? cur.h, z ?? cur.z,
      props !== undefined ? JSON.stringify(props) : cur.props,
      req.params.oid
    );
  res.json({ ok: true });
});

// Batch save all objects for a scene (replaces all)
app.put('/api/scenes/:id/objects', requireAuth, requirePerm('scenes.edit_any'), (req, res) => {
  const { objects } = req.body;
  if (!Array.isArray(objects)) return res.status(400).json({ error: 'objects array required' });
  db.prepare('DELETE FROM scene_objects WHERE scene_id=?').run(req.params.id);
  const insert = db.prepare('INSERT INTO scene_objects (id,scene_id,content_id,x,y,w,h,z,props,type,name,url,obj_start_time,obj_duration,transition_in,transition_out) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const tx = db.transaction(() => {
    objects.forEach((o, i) => {
      insert.run(
        o.id ?? uuidv4(), req.params.id, o.content_id ?? null,
        o.x ?? 0, o.y ?? 0, o.w ?? 960, o.h ?? 540,
        o.z ?? i, JSON.stringify(o.props ?? {}),
        o.type ?? null, o.name ?? null, o.url ?? null,
        o.obj_start_time ?? 0, o.obj_duration ?? 10,
        o.transition_in ?? 'none', o.transition_out ?? 'none'
      );
    });
  });
  tx();
  res.json({ ok: true });
});

app.delete('/api/scenes/:id/objects/:oid', requireAuth, requirePerm('scenes.edit_any'), (req, res) => {
  db.prepare('DELETE FROM scene_objects WHERE id=? AND scene_id=?').run(req.params.oid, req.params.id);
  res.json({ ok: true });
});

// Duplicate scene
app.post('/api/scenes/:id/duplicate', requireAuth, requirePerm('scenes.create'), (req, res) => {
  const src = db.prepare('SELECT * FROM scenes WHERE id=?').get(req.params.id);
  if (!src) return res.status(404).json({ error: 'Not found' });
  const newId = uuidv4();
  db.prepare('INSERT INTO scenes (id,name,width,height,duration,created_by) VALUES (?,?,?,?,?,?)')
    .run(newId, `${src.name} (копия)`, src.width, src.height, src.duration ?? 30, req.user.id);
  const objects = db.prepare('SELECT * FROM scene_objects WHERE scene_id=?').all(req.params.id);
  const ins = db.prepare('INSERT INTO scene_objects (id,scene_id,content_id,x,y,w,h,z,props,type,name,url,obj_start_time,obj_duration,transition_in,transition_out) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for (const o of objects) {
    ins.run(uuidv4(), newId, o.content_id || null, o.x, o.y, o.w, o.h, o.z, o.props, o.type || null, o.name || null, o.url || null, o.obj_start_time ?? 0, o.obj_duration ?? 10, o.transition_in ?? 'none', o.transition_out ?? 'none');
  }
  res.status(201).json(db.prepare('SELECT * FROM scenes WHERE id=?').get(newId));
});

// ── Scene versions ────────────────────────────────────────────────────────────

app.get('/api/scenes/:id/versions', requireAuth, requirePerm('scenes.view'), (req, res) => {
  const scene = db.prepare('SELECT id FROM scenes WHERE id=?').get(req.params.id);
  if (!scene) return res.status(404).json({ error: 'Not found' });
  const versions = db.prepare(
    'SELECT id, scene_id, version_num, label, created_at, created_by FROM scene_versions WHERE scene_id=? ORDER BY version_num DESC'
  ).all(req.params.id);
  res.json(versions);
});

app.post('/api/scenes/:id/versions', requireAuth, requirePerm('scenes.versions'), (req, res) => {
  const scene = db.prepare('SELECT * FROM scenes WHERE id=?').get(req.params.id);
  if (!scene) return res.status(404).json({ error: 'Not found' });

  const objects = db.prepare(
    'SELECT id, content_id, x, y, w, h, z, props, type, name, url, obj_start_time, obj_duration, transition_in, transition_out FROM scene_objects WHERE scene_id=?'
  ).all(req.params.id);

  const maxNum = db.prepare('SELECT MAX(version_num) AS m FROM scene_versions WHERE scene_id=?').get(req.params.id);
  const version_num = (maxNum?.m ?? 0) + 1;
  const { label } = req.body || {};
  const id = uuidv4();

  db.prepare('INSERT INTO scene_versions (id,scene_id,version_num,label,snapshot,created_by) VALUES (?,?,?,?,?,?)')
    .run(id, req.params.id, version_num, label || null, JSON.stringify(objects), req.user.id);

  pruneVersions('scene_versions', 'scene_id', req.params.id);
  res.status(201).json(db.prepare('SELECT id,scene_id,version_num,label,created_at,created_by FROM scene_versions WHERE id=?').get(id));
});

app.post('/api/scenes/:id/versions/:vid/restore', requireAuth, requirePerm('scenes.versions'), (req, res) => {
  const version = db.prepare('SELECT * FROM scene_versions WHERE id=? AND scene_id=?').get(req.params.vid, req.params.id);
  if (!version) return res.status(404).json({ error: 'Version not found' });

  const objects = JSON.parse(version.snapshot);
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM scene_objects WHERE scene_id=?').run(req.params.id);
    const ins = db.prepare(
      'INSERT INTO scene_objects (id,scene_id,content_id,x,y,w,h,z,props,type,name,url,obj_start_time,obj_duration,transition_in,transition_out) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    for (const o of objects) {
      ins.run(
        o.id, req.params.id, o.content_id ?? null,
        o.x ?? 0, o.y ?? 0, o.w ?? 960, o.h ?? 540,
        o.z ?? 0, o.props ?? '{}',
        o.type ?? null, o.name ?? null, o.url ?? null,
        o.obj_start_time ?? 0, o.obj_duration ?? 10,
        o.transition_in ?? 'none', o.transition_out ?? 'none'
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  // Return full scene (same as GET /api/scenes/:id)
  const scene = db.prepare('SELECT * FROM scenes WHERE id=?').get(req.params.id);
  const rows = db.prepare(`
    SELECT so.*, c.name, c.type, c.url AS c_url, c.html, c.filename,
           c.scroll_behavior, c.scroll_speed, c.scroll_duration, c.page_duration, c.muted
    FROM scene_objects so
    LEFT JOIN content c ON c.id = so.content_id
    WHERE so.scene_id = ?
    ORDER BY so.z ASC
  `).all(req.params.id);
  res.json({ ...scene, objects: rows.map(r => ({ ...r, props: (() => { try { return JSON.parse(r.props); } catch { return {}; } })() })) });
});

app.delete('/api/scenes/:id/versions/:vid', requireAuth, requirePerm('scenes.versions'), (req, res) => {
  const version = db.prepare('SELECT id FROM scene_versions WHERE id=? AND scene_id=?').get(req.params.vid, req.params.id);
  if (!version) return res.status(404).json({ error: 'Version not found' });
  db.prepare('DELETE FROM scene_versions WHERE id=?').run(req.params.vid);
  res.json({ ok: true });
});

// ── Web proxy ─────────────────────────────────────────────────────────────────

// Normalise a hostname to dotted-decimal if it looks like a numeric IP.
// Blocks decimal (2130706433), octal (0177.0.0.1) and hex (0x7f000001) forms.
function normaliseHost(host) {
  // Strip IPv6 brackets
  if (host.startsWith('[') && host.endsWith(']')) return host.slice(1, -1);

  // Pure numeric (decimal) — e.g. 2130706433 → 127.0.0.1
  if (/^\d+$/.test(host)) {
    const n = parseInt(host, 10);
    if (n >= 0 && n <= 0xffffffff) {
      return [(n >>> 24), (n >>> 16 & 0xff), (n >>> 8 & 0xff), (n & 0xff)].join('.');
    }
  }

  // Hex — 0x7f000001 or 0X7F000001
  if (/^0x[0-9a-f]+$/i.test(host)) {
    const n = parseInt(host, 16);
    if (n >= 0 && n <= 0xffffffff) {
      return [(n >>> 24), (n >>> 16 & 0xff), (n >>> 8 & 0xff), (n & 0xff)].join('.');
    }
  }

  // Octal octets — 0177.0.0.1
  if (/^(0\d+\.){1,3}\d+$/.test(host)) {
    const parts = host.split('.');
    const decoded = parts.map(p => parseInt(p, 8));
    if (decoded.every(v => !isNaN(v) && v >= 0 && v <= 255)) {
      return decoded.join('.');
    }
  }

  return host;
}

function isPrivateUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol === 'file:') return true;
    const h = normaliseHost(u.hostname.toLowerCase());
    return (
      h === 'localhost' ||
      /^127\./.test(h) ||
      /^10\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^169\.254\./.test(h) ||
      /^0\.0\.0\.0$/.test(h) ||
      /^::1$/.test(h) ||
      /^fc00:/i.test(h) ||
      /^fe80:/i.test(h)
    );
  } catch { return true; }
}
// In-memory cache for static assets (JS/CSS/fonts) — avoids re-fetching on
// every browser request. HTML pages are NOT cached (always fresh).
const proxyCache = new Map(); // url → { contentType, buf, ts }
const CACHE_TTL = 5 * 60 * 1000; // 5 min

// Rewrites absolute URLs in HTML/CSS to go through our proxy
// so the browser fetches everything from same origin — no CORS issues.
function rewriteUrlsToProxy(text, proxyBase, pageOrigin, isHtml) {
  // Rewrite absolute https?:// URLs → /api/proxy?url=...
  const rewriteAbs = (url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    try { new URL(url); } catch { return url; } // not a valid URL — leave alone
    return `${proxyBase}?url=${encodeURIComponent(url)}`;
  };

  // Expand root-relative /path → pageOrigin/path first
  const expandRoot = (path) =>
    path.startsWith('//') ? `https:${path}` :
    path.startsWith('/') ? `${pageOrigin}${path}` : path;

  if (isHtml) {
    // src="...", href="...", action="..."
    text = text.replace(
      /((?:src|href|action)=["'])([^"']+)(["'])/g,
      (_, attr, url, close) => `${attr}${rewriteAbs(expandRoot(url))}${close}`
    );
    // srcset="url 2x, url2 3x"
    text = text.replace(
      /(srcset=["'])([^"']+)(["'])/g,
      (_, attr, val, close) => {
        const rewritten = val.replace(/(\S+)(\s+\S+)?/g, (_, u, d) => rewriteAbs(expandRoot(u)) + (d || ''));
        return `${attr}${rewritten}${close}`;
      }
    );
    // Strip inline CSP meta tags
    text = text.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
  } else {
    // CSS: url('...') url("...") url(...)
    text = text.replace(
      /url\((['"]?)([^'")]+)\1\)/g,
      (_, q, url) => `url(${q}${rewriteAbs(expandRoot(url))}${q})`
    );
    // CSS @import "..."
    text = text.replace(
      /@import\s+(['"])([^'"]+)\1/g,
      (_, q, url) => `@import ${q}${rewriteAbs(expandRoot(url))}${q}`
    );
  }
  return text;
}

app.get('/api/proxy', proxyLimiter, async (req, res) => {
  const { url: rawUrl, auth } = req.query;
  if (!rawUrl) return res.status(400).send('url required');

  let targetUrl;
  try { targetUrl = new URL(decodeURIComponent(rawUrl)); } catch {
    return res.status(400).send('invalid url');
  }

  if (isPrivateUrl(targetUrl.toString())) return res.status(403).json({ error: 'URL не разрешён' });

  const upstreamHeaders = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124',
    'Accept': '*/*',
    'Accept-Language': 'ru,en;q=0.9',
  };
  if (auth) upstreamHeaders['Authorization'] = `Basic ${auth}`;

  // Serve cacheable static assets from memory cache
  const cacheKey = targetUrl.toString();
  const cached = proxyCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    res.removeHeader('x-frame-options');
    res.removeHeader('content-security-policy');
    res.set('content-type', cached.contentType);
    res.set('access-control-allow-origin', '*');
    return res.send(cached.buf);
  }

  const fetchWithRetry = async (url, opts, retries = 2) => {
    for (let i = 0; i <= retries; i++) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 15000);
        const r = await fetch(url, { ...opts, signal: controller.signal });
        clearTimeout(t);
        return r;
      } catch (e) {
        if (i === retries) throw e;
        logger.log('warn', 'proxy', `retry ${i + 1} for ${url}`, { error: e.message });
        await new Promise(ok => setTimeout(ok, 300 * (i + 1)));
      }
    }
  };

  try {
    const upstream = await fetchWithRetry(targetUrl.toString(), { headers: upstreamHeaders, redirect: 'follow' });
    const contentType = upstream.headers.get('content-type') || '';
    const finalUrl = upstream.url;
    const pageOrigin = new URL(finalUrl).origin;
    const proxyBase = '/api/proxy';

    logger.log('info', 'proxy', `${upstream.status} ${contentType.split(';')[0]} ${finalUrl}`, { status: upstream.status, url: finalUrl });

    const isHtml = contentType.includes('text/html');
    const isCss = contentType.includes('text/css');

    res.removeHeader('x-frame-options');
    res.removeHeader('content-security-policy');
    res.set('content-type', contentType || 'application/octet-stream');
    res.set('access-control-allow-origin', '*');

    if (isHtml) {
      let html = await upstream.text();
      html = rewriteUrlsToProxy(html, proxyBase, pageOrigin, true);
      const bust = `<script>(function(){
  var P = '/api/proxy?url=';
  function proxify(v) {
    if (!v) return v;
    v = String(v);
    if (v.startsWith('data:') || v.startsWith('blob:') || v.startsWith('/api/proxy')) return v;
    if (/^https?:\\/\\//i.test(v)) return P + encodeURIComponent(v);
    if (v.startsWith('/') && !v.startsWith('//')) return P + encodeURIComponent(${JSON.stringify(pageOrigin)} + v);
    return v;
  }
  // Suppress frame-busting
  try{
    Object.defineProperty(window,'top',{get:function(){return window}});
    Object.defineProperty(window,'parent',{get:function(){return window}});
  }catch(e){}
  // Patch Image src
  var imgDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
  Object.defineProperty(HTMLImageElement.prototype,'src',{
    get: imgDesc.get,
    set: function(v){ imgDesc.set.call(this, proxify(v)); },
    configurable: true
  });
  // Patch createElement for scripts
  var _ce = document.createElement.bind(document);
  document.createElement = function(tag) {
    var el = _ce(tag);
    var t = tag.toLowerCase();
    if (t === 'script' || t === 'img') {
      var d = Object.getOwnPropertyDescriptor(t==='script'?HTMLScriptElement.prototype:HTMLImageElement.prototype,'src') || {};
      Object.defineProperty(el,'src',{
        get: function(){ return el.getAttribute('src')||''; },
        set: function(v){ el.setAttribute('src', proxify(v)); },
        configurable: true
      });
    }
    return el;
  };
  // MutationObserver: rewrite src/srcset on any newly added img
  new MutationObserver(function(muts){
    muts.forEach(function(m){
      m.addedNodes.forEach(function(n){
        if(!n.querySelectorAll) return;
        n.querySelectorAll('img[src],img[data-src]').forEach(fix);
        if(n.tagName==='IMG') fix(n);
      });
      if(m.type==='attributes'){
        var n=m.target;
        if(n.tagName==='IMG') fix(n);
      }
    });
  }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','data-src','srcset']});
  function fix(img){
    var s=img.getAttribute('src');
    if(s && !/^data:|^blob:|api\\/proxy/.test(s) && /^https?:\\/\\//.test(s)){
      img.setAttribute('src', proxify(s));
    }
    var ds=img.getAttribute('data-src');
    if(ds && !/^data:|^blob:|api\\/proxy/.test(ds) && /^https?:\\/\\//.test(ds)){
      img.setAttribute('data-src', proxify(ds));
    }
  }
})();</script>`;
      html = html.replace(/(<head(?:\s[^>]*)?>)/i, `$1${bust}`);
      res.set('content-type', 'text/html; charset=utf-8');
      return res.send(html);
    }

    if (isCss) {
      let css = await upstream.text();
      css = rewriteUrlsToProxy(css, proxyBase, pageOrigin, false);
      const buf = Buffer.from(css);
      proxyCache.set(cacheKey, { contentType, buf, ts: Date.now() });
      return res.send(buf);
    }

    // Fonts, images and PDFs must be sent as binary — never decode as text
    const isFontOrImage = /font|image|octet-stream|woff|ttf|otf|eot|svg|pdf/.test(contentType)
      || /\.(woff2?|ttf|otf|eot|svg|png|jpe?g|gif|webp|ico|pdf)(\?|$)/i.test(finalUrl);
    if (isFontOrImage) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      proxyCache.set(cacheKey, { contentType, buf, ts: Date.now() });
      return res.send(buf);
    }

    const isJs = contentType.includes('javascript') || /\.js(\?|$)/i.test(finalUrl);
    if (isJs) {
      let js = await upstream.text();
      // If response is actually HTML (error page), don't process as JS
      if (js.trimStart().startsWith('<')) {
        logger.log('warn', 'proxy', `got HTML instead of JS for ${finalUrl}`, { url: finalUrl });
        return res.status(502).send('Expected JS, got HTML');
      }
      const proxyNextBase = `/api/proxy?url=${encodeURIComponent(pageOrigin + '/_next/')}`;
      js = js.replace(/("|\')(\/_next\/)(\1)/g, `$1${proxyNextBase}$1`);
      js = js.replace(/"(\/_next\/[^"]{3,})"/g, (_, p) =>
        `"/api/proxy?url=${encodeURIComponent(pageOrigin + p)}"`
      );
      js = js.replace(/'(\/_next\/[^']{3,})'/g, (_, p) =>
        `'/api/proxy?url=${encodeURIComponent(pageOrigin + p)}'`
      );
      const buf = Buffer.from(js);
      proxyCache.set(cacheKey, { contentType, buf, ts: Date.now() });
      return res.send(buf);
    }

    // Binary fallback
    const buf = Buffer.from(await upstream.arrayBuffer());
    proxyCache.set(cacheKey, { contentType, buf, ts: Date.now() });
    res.send(buf);
  } catch (err) {
    logger.log('error', 'proxy', `proxy error: ${err.message}`, { error: err.message });
    return res.status(500).json({ error: 'Ошибка прокси' });
  }
});

// ── Webhooks ──────────────────────────────────────────────────────────────────

app.get('/api/webhooks', requireAuth, requirePerm('integrations.view'), (req, res) => {
  const hooks = db.prepare('SELECT id, name, url, events, enabled, created_at FROM webhooks ORDER BY created_at DESC').all();
  res.json(hooks.map(h => ({ ...h, events: JSON.parse(h.events || '[]') })));
});

app.post('/api/webhooks', requireAuth, requirePerm('integrations.manage'), (req, res) => {
  const { name, url, secret, events = [], enabled = 1 } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  if (isPrivateUrl(url)) return res.status(400).json({ error: 'URL не разрешён' });
  const id = uuidv4();
  db.prepare('INSERT INTO webhooks (id,name,url,secret,events,enabled) VALUES (?,?,?,?,?,?)')
    .run(id, name, url, secret ?? null, JSON.stringify(events), enabled ? 1 : 0);
  const hook = db.prepare('SELECT * FROM webhooks WHERE id=?').get(id);
  res.status(201).json({ ...hook, events: JSON.parse(hook.events) });
});

app.put('/api/webhooks/:id', requireAuth, requirePerm('integrations.manage'), (req, res) => {
  const hook = db.prepare('SELECT * FROM webhooks WHERE id=?').get(req.params.id);
  if (!hook) return res.status(404).json({ error: 'Not found' });
  const { name, url, secret, events, enabled } = req.body;
  if (url && isPrivateUrl(url)) return res.status(400).json({ error: 'URL не разрешён' });
  db.prepare(`UPDATE webhooks SET
    name=COALESCE(?,name),
    url=COALESCE(?,url),
    secret=COALESCE(?,secret),
    events=COALESCE(?,events),
    enabled=COALESCE(?,enabled)
    WHERE id=?`)
    .run(
      name ?? null, url ?? null, secret !== undefined ? (secret || null) : null,
      events !== undefined ? JSON.stringify(events) : null,
      enabled !== undefined ? (enabled ? 1 : 0) : null,
      req.params.id
    );
  const updated = db.prepare('SELECT * FROM webhooks WHERE id=?').get(req.params.id);
  res.json({ ...updated, events: JSON.parse(updated.events) });
});

app.delete('/api/webhooks/:id', requireAuth, requirePerm('integrations.manage'), (req, res) => {
  const hook = db.prepare('SELECT * FROM webhooks WHERE id=?').get(req.params.id);
  if (!hook) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM webhooks WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/webhooks/:id/test', requireAuth, requirePerm('integrations.manage'), async (req, res) => {
  const hook = db.prepare('SELECT * FROM webhooks WHERE id=?').get(req.params.id);
  if (!hook) return res.status(404).json({ error: 'Not found' });
  const crypto = require('crypto');
  const body = JSON.stringify({ event: 'test', timestamp: new Date().toISOString(), data: { message: 'Test webhook' } });
  const headers = { 'Content-Type': 'application/json', 'X-DS-Event': 'test' };
  if (hook.secret) {
    const sig = crypto.createHmac('sha256', hook.secret).update(body).digest('hex');
    headers['X-DS-Signature'] = 'sha256=' + sig;
  }
  try {
    const resp = await fetch(hook.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) });
    res.json({ ok: true, status: resp.status });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Logs ──────────────────────────────────────────────────────────────────────
app.get('/api/logs', requireAuth, requirePerm('logs.view'), (req, res) => {
  const { level, category, search, limit, before } = req.query;
  res.json(logger.getLogs({
    level,
    category,
    search,
    limit: limit ? Math.min(parseInt(limit), 1000) : 500,
    before: before ? parseInt(before) : undefined,
  }));
});

app.delete('/api/logs', requireAuth, requirePerm('logs.clear'), (req, res) => {
  logger.clear();
  res.json({ ok: true });
});

app.get('/api/logs/export', requireAuth, requirePerm('logs.view'), (req, res) => {
  const { level, category, search, format = 'json' } = req.query;
  const entries = logger.getLogsFromDisk({ level, category, search, limit: 50000 });

  const date = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  if (format === 'csv') {
    const header = 'id,timestamp,level,category,message,meta\n';
    const rows = entries.map(e =>
      [e.id, new Date(e.ts).toISOString(), e.level, e.category,
        `"${e.message.replace(/"/g, '""')}"`,
        `"${JSON.stringify(e.meta).replace(/"/g, '""')}"`
      ].join(',')
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ds-logs-${date}.csv"`);
    return res.send(header + rows);
  }

  // JSON (default)
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ds-logs-${date}.json"`);
  res.json(entries);
});

// ── Backup ────────────────────────────────────────────────────────────────────

// Список локальных бекапов
app.get('/api/backup/local', requireAuth, requirePerm('backup.view'), (_req, res) => {
  res.json(backup.listLocal());
});

// Скачать локальный бекап
app.get('/api/backup/local/:filename', requireAuth, requirePerm('backup.view'), (req, res) => {
  const file = backup.getLocalPath(req.params.filename);
  if (!file) return res.status(404).json({ error: 'Not found' });
  res.download(file);
});

// Удалить локальный бекап
app.post('/api/backup/local/:filename/restore', requireAuth, requirePerm('backup.restore'), async (req, res) => {
  try {
    // Отвечаем сразу — сервер уйдёт в рестарт через 500ms
    res.json({ ok: true, message: 'Восстановление запущено. Сервер перезапустится через несколько секунд.' });
    await backup.restore(req.params.filename);
  } catch (e) {
    // Если res ещё не отправлен (ошибка до process.exit)
    if (!res.headersSent) res.status(500).json({ error: e.message });
    else logger.log('error', 'backup', `Restore failed: ${e.message}`);
  }
});

app.delete('/api/backup/local/:filename', requireAuth, requirePerm('backup.manage'), (req, res) => {
  try {
    backup.deleteLocal(req.params.filename);
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// Запустить бекап вручную
app.post('/api/backup/run', requireAuth, requirePerm('backup.run'), async (req, res) => {
  try {
    const dests = db.prepare('SELECT * FROM backup_destinations WHERE enabled=1').all()
      .map(d => ({ ...d, ...JSON.parse(d.config || '{}') }));
    const result = await backup.runBackup(dests);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Получить настройки (расписание)
app.get('/api/backup/settings', requireAuth, requirePerm('backup.view'), (_req, res) => {
  const settings = db.prepare('SELECT * FROM backup_settings WHERE id=1').get() || { cron: null };
  res.json(settings);
});

// Сохранить расписание
app.put('/api/backup/settings', requireAuth, requirePerm('backup.manage'), (req, res) => {
  const { cron } = req.body;
  db.prepare('INSERT OR REPLACE INTO backup_settings (id, cron, updated_at) VALUES (1, ?, unixepoch())')
    .run(cron || null);
  // Перезапускаем cron
  const dests = db.prepare('SELECT * FROM backup_destinations WHERE enabled=1').all()
    .map(d => ({ ...d, ...JSON.parse(d.config || '{}') }));
  backup.scheduleCron(cron, dests);
  res.json({ ok: true });
});

// CRUD для destinations
app.get('/api/backup/destinations', requireAuth, requirePerm('backup.view'), (_req, res) => {
  const rows = db.prepare('SELECT id, name, type, enabled, created_at FROM backup_destinations ORDER BY created_at').all();
  res.json(rows);
});

app.post('/api/backup/destinations', requireAuth, requirePerm('backup.manage'), (req, res) => {
  const { name, type, enabled = 1, config = {} } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name и type обязательны' });
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  db.prepare('INSERT INTO backup_destinations (id, name, type, enabled, config) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, type, enabled ? 1 : 0, JSON.stringify(config));
  res.status(201).json(db.prepare('SELECT id, name, type, enabled, created_at FROM backup_destinations WHERE id=?').get(id));
});

app.put('/api/backup/destinations/:id', requireAuth, requirePerm('backup.manage'), (req, res) => {
  const { name, type, enabled, config } = req.body;
  const row = db.prepare('SELECT * FROM backup_destinations WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE backup_destinations SET name=COALESCE(?,name), type=COALESCE(?,type), enabled=COALESCE(?,enabled), config=COALESCE(?,config) WHERE id=?')
    .run(name ?? null, type ?? null, enabled !== undefined ? (enabled ? 1 : 0) : null, config ? JSON.stringify(config) : null, req.params.id);
  // Перезапускаем cron если что-то изменилось
  const bset = db.prepare('SELECT cron FROM backup_settings WHERE id=1').get();
  if (bset?.cron) {
    const dests = db.prepare('SELECT * FROM backup_destinations WHERE enabled=1').all()
      .map(d => ({ ...d, ...JSON.parse(d.config || '{}') }));
    backup.scheduleCron(bset.cron, dests);
  }
  res.json(db.prepare('SELECT id, name, type, enabled, created_at FROM backup_destinations WHERE id=?').get(req.params.id));
});

app.delete('/api/backup/destinations/:id', requireAuth, requirePerm('backup.manage'), (req, res) => {
  db.prepare('DELETE FROM backup_destinations WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Swagger (optional) ────────────────────────────────────────────────────────

if (process.env.SWAGGER_ENABLED === 'true') {
  const swaggerUi = require('swagger-ui-express');
  const { swaggerSpec } = require('./swagger');
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  console.log('[DS] Swagger UI → http://localhost:' + PORT + '/api/docs');
}

// Serve built React frontend (npm run build → frontend/build)
const FRONTEND_BUILD = path.join(__dirname, '../frontend/build');
if (fs.existsSync(FRONTEND_BUILD)) {
  app.use(express.static(FRONTEND_BUILD));
  // SPA fallback — only for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(FRONTEND_BUILD, 'index.html'));
  });
}

process.on('uncaughtException', err => console.error('[uncaught]', err.message));
process.on('unhandledRejection', err => console.error('[unhandled]', err));

app.listen(PORT, () => {
  console.log(`DS backend → http://localhost:${PORT}`);
  logger.log('info', 'system', 'DS backend started', { port: PORT });
});
