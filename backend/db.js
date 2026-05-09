// Uses Node.js built-in sqlite (Node >= 22.5)
require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(__dirname, process.env.DB_PATH)
  : path.join(__dirname, 'signage.db');

const db = new DatabaseSync(DB_PATH, { readOnly: false });

db.exec(`
  CREATE TABLE IF NOT EXISTS content (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('image', 'video', 'webpage', 'html', 'pdf')),
    url TEXT,
    html TEXT,
    filename TEXT,
    duration INTEGER NOT NULL DEFAULT 10,
    page_duration INTEGER NOT NULL DEFAULT 5,
    scroll_behavior TEXT NOT NULL DEFAULT 'none' CHECK(scroll_behavior IN ('none', 'smooth')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS playlist_items (
    id TEXT PRIMARY KEY,
    playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    content_id TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    duration_override INTEGER
  );

  CREATE TABLE IF NOT EXISTS screens (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    playlist_id TEXT REFERENCES playlists(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT,
    screen_id TEXT REFERENCES screens(id) ON DELETE SET NULL,
    last_seen INTEGER NOT NULL DEFAULT (unixepoch()),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    device_token TEXT UNIQUE,
    approved INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    width INTEGER NOT NULL DEFAULT 1920,
    height INTEGER NOT NULL DEFAULT 1080,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS scene_objects (
    id TEXT PRIMARY KEY,
    scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    content_id TEXT REFERENCES content(id) ON DELETE SET NULL,
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    w REAL NOT NULL DEFAULT 960,
    h REAL NOT NULL DEFAULT 540,
    z INTEGER NOT NULL DEFAULT 0,
    props TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    device_id TEXT REFERENCES devices(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 1,
    days TEXT NOT NULL DEFAULT '1111111',
    on_time TEXT NOT NULL DEFAULT '08:00',
    off_time TEXT NOT NULL DEFAULT '22:00',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS device_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    screen_id TEXT REFERENCES screens(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS device_group_members (
    group_id TEXT NOT NULL REFERENCES device_groups(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, device_id)
  );

  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    permissions TEXT NOT NULL DEFAULT '[]',
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    secret TEXT,
    events TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS backup_destinations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('telegram', 'url', 'sftp')),
    enabled INTEGER NOT NULL DEFAULT 1,
    config TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS backup_settings (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    cron TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// ── Migrate existing tables ───────────────────────────────────────────────────

const soCols = db.prepare("PRAGMA table_info(scene_objects)").all().map(r => r.name);
if (!soCols.includes('type'))
  db.exec("ALTER TABLE scene_objects ADD COLUMN type TEXT");
if (!soCols.includes('name'))
  db.exec("ALTER TABLE scene_objects ADD COLUMN name TEXT");
if (!soCols.includes('url'))
  db.exec("ALTER TABLE scene_objects ADD COLUMN url TEXT");

const screenCols = db.prepare("PRAGMA table_info(screens)").all().map(r => r.name);
if (!screenCols.includes('scene_id'))
  db.exec('ALTER TABLE screens ADD COLUMN scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL');
if (!screenCols.includes('command'))
  db.exec('ALTER TABLE screens ADD COLUMN command TEXT');

const piCols = db.prepare("PRAGMA table_info(playlist_items)").all().map(r => r.name);
if (!piCols.includes('scene_id'))
  db.exec('ALTER TABLE playlist_items ADD COLUMN scene_id TEXT REFERENCES scenes(id) ON DELETE CASCADE');
if (!piCols.includes('start_time'))
  db.exec('ALTER TABLE playlist_items ADD COLUMN start_time REAL NOT NULL DEFAULT 0');

const existingCols = db.prepare("PRAGMA table_info(content)").all().map(r => r.name);
if (!existingCols.includes('page_duration'))
  db.exec('ALTER TABLE content ADD COLUMN page_duration INTEGER NOT NULL DEFAULT 5');
if (!existingCols.includes('scroll_behavior'))
  db.exec("ALTER TABLE content ADD COLUMN scroll_behavior TEXT NOT NULL DEFAULT 'none'");
if (!existingCols.includes('scroll_speed'))
  db.exec('ALTER TABLE content ADD COLUMN scroll_speed INTEGER NOT NULL DEFAULT 100');
if (!existingCols.includes('scroll_duration'))
  db.exec('ALTER TABLE content ADD COLUMN scroll_duration INTEGER NOT NULL DEFAULT 30');
if (!existingCols.includes('muted'))
  db.exec('ALTER TABLE content ADD COLUMN muted INTEGER NOT NULL DEFAULT 1');

const schCols = db.prepare("PRAGMA table_info(schedules)").all().map(r => r.name);
if (!schCols.includes('group_id'))
  db.exec('ALTER TABLE schedules ADD COLUMN group_id TEXT REFERENCES device_groups(id) ON DELETE CASCADE');

// Миграция: сделать device_id nullable
{
  const schInfo = db.prepare("PRAGMA table_info(schedules)").all();
  const deviceIdCol = schInfo.find(c => c.name === 'device_id');
  if (deviceIdCol && deviceIdCol.notnull === 1) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      CREATE TABLE schedules_new (
        id TEXT PRIMARY KEY,
        device_id TEXT REFERENCES devices(id) ON DELETE CASCADE,
        group_id TEXT REFERENCES device_groups(id) ON DELETE CASCADE,
        enabled INTEGER NOT NULL DEFAULT 1,
        days TEXT NOT NULL DEFAULT '1111111',
        on_time TEXT NOT NULL DEFAULT '08:00',
        off_time TEXT NOT NULL DEFAULT '22:00',
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      INSERT INTO schedules_new (id, device_id, group_id, enabled, days, on_time, off_time, created_at)
        SELECT id, device_id, group_id, enabled, days, on_time, off_time, created_at FROM schedules;
      DROP TABLE schedules;
      ALTER TABLE schedules_new RENAME TO schedules;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }
}

const devCols = db.prepare("PRAGMA table_info(devices)").all().map(r => r.name);
if (!devCols.includes('group_id'))
  db.exec('ALTER TABLE devices ADD COLUMN group_id TEXT REFERENCES device_groups(id) ON DELETE SET NULL');
if (!devCols.includes('device_token'))
  db.exec('ALTER TABLE devices ADD COLUMN device_token TEXT');
if (!devCols.includes('approved'))
  db.exec('ALTER TABLE devices ADD COLUMN approved INTEGER DEFAULT 0');

const soTimingCols = db.prepare("PRAGMA table_info(scene_objects)").all().map(r => r.name);
if (!soTimingCols.includes('obj_start_time'))
  db.exec('ALTER TABLE scene_objects ADD COLUMN obj_start_time REAL NOT NULL DEFAULT 0');
if (!soTimingCols.includes('obj_duration'))
  db.exec('ALTER TABLE scene_objects ADD COLUMN obj_duration REAL NOT NULL DEFAULT 10');
if (!soTimingCols.includes('transition_in'))
  db.exec("ALTER TABLE scene_objects ADD COLUMN transition_in TEXT NOT NULL DEFAULT 'none'");
if (!soTimingCols.includes('transition_out'))
  db.exec("ALTER TABLE scene_objects ADD COLUMN transition_out TEXT NOT NULL DEFAULT 'none'");

const sceneCols = db.prepare("PRAGMA table_info(scenes)").all().map(r => r.name);
if (!sceneCols.includes('duration'))
  db.exec('ALTER TABLE scenes ADD COLUMN duration REAL NOT NULL DEFAULT 30');

// created_by для всех основных сущностей
for (const [table, col] of [
  ['content', 'created_by'],
  ['playlists', 'created_by'],
  ['scenes', 'created_by'],
  ['screens', 'created_by'],
  ['device_groups', 'created_by'],
]) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
  if (!cols.includes(col))
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT REFERENCES users(id) ON DELETE SET NULL`);
}

// ── Version history tables ─────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS playlist_versions (
    id TEXT PRIMARY KEY,
    playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    version_num INTEGER NOT NULL,
    label TEXT,
    snapshot TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS scene_versions (
    id TEXT PRIMARY KEY,
    scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    version_num INTEGER NOT NULL,
    label TEXT,
    snapshot TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL
  );
`);

db.exec('PRAGMA foreign_keys = ON;');

// Indexes for hot-path lookups
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_devices_code ON devices(code);
  CREATE INDEX IF NOT EXISTS idx_devices_token ON devices(device_token);
  CREATE INDEX IF NOT EXISTS idx_devices_screen ON devices(screen_id);
  CREATE INDEX IF NOT EXISTS idx_playlist_versions_playlist ON playlist_versions(playlist_id);
  CREATE INDEX IF NOT EXISTS idx_scene_versions_scene ON scene_versions(scene_id);
`);

db.transaction = (fn) => () => {
  db.exec('BEGIN');
  try { fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
};

// ── Seed default roles & admin user ──────────────────────────────────────────

const ALL_PERMS = [
  'content.view',   'content.create',   'content.edit_own',   'content.edit_any',   'content.delete_own',   'content.delete_any',
  'playlists.view', 'playlists.create', 'playlists.edit_own', 'playlists.edit_any', 'playlists.delete_own', 'playlists.delete_any', 'playlists.versions',
  'scenes.view',    'scenes.create',    'scenes.edit_own',    'scenes.edit_any',    'scenes.delete_own',    'scenes.delete_any',    'scenes.versions',
  'screens.view',   'screens.create',   'screens.edit_own',   'screens.edit_any',   'screens.delete_own',   'screens.delete_any',
  'groups.view',    'groups.create',    'groups.edit_own',    'groups.edit_any',    'groups.delete_own',    'groups.delete_any',
  'devices.view',   'devices.manage',   'devices.approve',
  'users.view',     'users.create',     'users.edit',         'users.delete',
  'roles.view',     'roles.edit',
  'integrations.view', 'integrations.manage',
  'logs.view', 'logs.clear',
  'backup.view', 'backup.run', 'backup.manage', 'backup.restore',
  'dashboard.view',
];

const MODERATOR_PERMS = ALL_PERMS.filter(p => !p.startsWith('users.') && !p.startsWith('roles.'));

const CONTENT_MANAGER_PERMS = [
  'content.view',   'content.create',   'content.edit_own',   'content.delete_own',
  'playlists.view', 'playlists.create', 'playlists.edit_own', 'playlists.delete_own', 'playlists.versions',
  'scenes.view',    'scenes.create',    'scenes.edit_own',    'scenes.delete_own',    'scenes.versions',
  'screens.view',   'screens.create',   'screens.edit_own',   'screens.delete_own',
  'groups.view',
  'devices.view',
  'dashboard.view',
];

const GUEST_PERMS = ALL_PERMS.filter(p => p.endsWith('.view') && !p.startsWith('users.') && !p.startsWith('roles.'));

const DEFAULT_ROLES = [
  { id: 'role_admin',           name: 'Администратор',     permissions: ALL_PERMS,             is_system: 1 },
  { id: 'role_moderator',       name: 'Модератор',         permissions: MODERATOR_PERMS,        is_system: 1 },
  { id: 'role_content_manager', name: 'Контент-менеджер',  permissions: CONTENT_MANAGER_PERMS, is_system: 1 },
  { id: 'role_guest',           name: 'Гость',             permissions: GUEST_PERMS,            is_system: 1 },
];

for (const role of DEFAULT_ROLES) {
  const existing = db.prepare('SELECT id FROM roles WHERE id=?').get(role.id);
  if (!existing) {
    db.prepare('INSERT INTO roles (id,name,permissions,is_system) VALUES (?,?,?,?)')
      .run(role.id, role.name, JSON.stringify(role.permissions), role.is_system);
  } else {
    // Всегда синхронизируем permissions системных ролей при рестарте
    db.prepare('UPDATE roles SET permissions=? WHERE id=?')
      .run(JSON.stringify(role.permissions), role.id);
  }
}

// Первый запуск — создаём admin если нет ни одного пользователя
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
if (userCount.c === 0) {
  const { v4: uuidv4 } = require('uuid');
  const adminPass = process.env.ADMIN_PASSWORD || require('crypto').randomBytes(12).toString('base64url');
  const hash = bcrypt.hashSync(adminPass, 10);
  db.prepare('INSERT INTO users (id,username,password_hash,role_id) VALUES (?,?,?,?)')
    .run(uuidv4(), 'admin', hash, 'role_admin');
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`[DS] Создан пользователь admin. Пароль: ${adminPass}`);
    console.log('[DS] Установите ADMIN_PASSWORD в .env чтобы контролировать пароль администратора.');
  } else {
    console.log('[DS] Создан пользователь admin (пароль задан через ADMIN_PASSWORD).');
  }
}

module.exports = db;
module.exports.ALL_PERMS = ALL_PERMS;
