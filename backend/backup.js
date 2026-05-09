/**
 * Backup module — создаёт zip (БД + uploads), хранит локально,
 * отправляет на: Telegram, URL (HTTP POST), SFTP.
 * Поддерживает восстановление из локального архива.
 */
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const archiver = require('archiver');
const cron    = require('node-cron');
const AdmZip  = require('adm-zip');

const DB_PATH    = process.env.DB_PATH    || path.join(__dirname, 'signage.db');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
const BACKUP_DIR  = process.env.BACKUP_DIR  || path.join(__dirname, 'data', 'backups');
const MAX_LOCAL   = 10; // сколько локальных архивов хранить

let _logger = null;
function setLogger(l) { _logger = l; }

// ── Создание zip-архива ───────────────────────────────────────────────────────

function createArchive() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = path.join(BACKUP_DIR, `backup-${ts}.zip`);
    const out  = fs.createWriteStream(file);
    const arc  = archiver('zip', { zlib: { level: 6 } });

    out.on('close', () => resolve(file));
    arc.on('error', reject);
    arc.pipe(out);

    // БД
    if (fs.existsSync(DB_PATH)) arc.file(DB_PATH, { name: 'signage.db' });
    // Uploads
    if (fs.existsSync(UPLOADS_DIR)) arc.directory(UPLOADS_DIR, 'uploads');

    arc.finalize();
  });
}

// ── Ротация локальных бекапов ─────────────────────────────────────────────────

function pruneLocal() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup-') && f.endsWith('.zip'))
      .map(f => ({ name: f, mt: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mt - a.mt);

    for (const f of files.slice(MAX_LOCAL)) {
      fs.unlinkSync(path.join(BACKUP_DIR, f.name));
      _logger?.log('info', 'backup', `pruned old backup: ${f.name}`);
    }
  } catch (e) {
    _logger?.log('warn', 'backup', `prune error: ${e.message}`);
  }
}

// ── Отправка в Telegram ───────────────────────────────────────────────────────

async function sendTelegram(file, cfg) {
  const { botToken, chatId } = cfg;
  if (!botToken || !chatId) throw new Error('Telegram: botToken и chatId обязательны');

  const FormData = (await import('node:stream')).PassThrough;
  // Используем fetch с multipart вручную
  const boundary = '----DS' + crypto.randomBytes(8).toString('hex');
  const filename  = path.basename(file);
  const fileData  = fs.readFileSync(file);

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${filename}"\r\nContent-Type: application/zip\r\n\r\n`),
    fileData,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
      signal: controller.signal,
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.description || 'Telegram API error');
  } finally {
    clearTimeout(timer);
  }
}

// ── Отправка на URL (HTTP POST) ───────────────────────────────────────────────

async function sendUrl(file, cfg) {
  const { url, secret } = cfg;
  if (!url) throw new Error('URL: url обязателен');

  const filename = path.basename(file);
  const fileData = fs.readFileSync(file);
  const boundary = '----DS' + crypto.randomBytes(8).toString('hex');

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/zip\r\n\r\n`),
    fileData,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const headers = { 'Content-Type': `multipart/form-data; boundary=${boundary}` };
  if (secret) {
    const sig = crypto.createHmac('sha256', secret).update(fileData).digest('hex');
    headers['X-DS-Signature'] = 'sha256=' + sig;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  } finally {
    clearTimeout(timer);
  }
}

// ── Отправка на SFTP ──────────────────────────────────────────────────────────

async function sendSftp(file, cfg) {
  const { host, port = 22, username, password, privateKey, remotePath = '/backups' } = cfg;
  if (!host || !username) throw new Error('SFTP: host и username обязательны');

  const SftpClient = require('ssh2-sftp-client');
  const sftp = new SftpClient();

  const connectOpts = { host, port: Number(port), username };
  if (privateKey) connectOpts.privateKey = Buffer.from(privateKey);
  else connectOpts.password = password;

  await sftp.connect(connectOpts);
  try {
    // Создаём директорию если не существует
    await sftp.mkdir(remotePath, true).catch(() => {});
    const remote = remotePath.replace(/\/$/, '') + '/' + path.basename(file);
    await sftp.put(file, remote);
  } finally {
    await sftp.end();
  }
}

// ── Основная функция бекапа ───────────────────────────────────────────────────

async function runBackup(destinations = []) {
  _logger?.log('info', 'backup', 'Запуск бекапа...');
  let file;
  try {
    file = await createArchive();
    const stat = fs.statSync(file);
    _logger?.log('info', 'backup', `Архив создан: ${path.basename(file)}`, { size: stat.size });
  } catch (e) {
    _logger?.log('error', 'backup', `Ошибка создания архива: ${e.message}`);
    throw e;
  }

  pruneLocal();

  const results = [];

  for (const dest of destinations) {
    if (!dest.enabled) continue;
    const label = dest.type + (dest.name ? ` (${dest.name})` : '');
    try {
      if (dest.type === 'telegram') await sendTelegram(file, dest);
      else if (dest.type === 'url')  await sendUrl(file, dest);
      else if (dest.type === 'sftp') await sendSftp(file, dest);
      _logger?.log('info', 'backup', `Отправлено → ${label}`);
      results.push({ type: dest.type, name: dest.name, ok: true });
    } catch (e) {
      _logger?.log('error', 'backup', `Ошибка отправки → ${label}: ${e.message}`);
      results.push({ type: dest.type, name: dest.name, ok: false, error: e.message });
    }
  }

  return { file: path.basename(file), size: fs.statSync(file).size, results };
}

// ── Список локальных бекапов ──────────────────────────────────────────────────

function listLocal() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup-') && f.endsWith('.zip'))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return { name: f, size: stat.size, createdAt: stat.mtimeMs };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}

// ── Скачать локальный бекап ───────────────────────────────────────────────────

function getLocalPath(filename) {
  const safe = path.basename(filename); // защита от path traversal
  const full = path.join(BACKUP_DIR, safe);
  if (!full.startsWith(BACKUP_DIR)) return null;
  return fs.existsSync(full) ? full : null;
}

// ── Удалить локальный бекап ───────────────────────────────────────────────────

function deleteLocal(filename) {
  const full = getLocalPath(filename);
  if (full) fs.unlinkSync(full);
}

// ── Cron-планировщик ──────────────────────────────────────────────────────────

let _cronJob = null;

function scheduleCron(cronExpr, destinations) {
  if (_cronJob) { _cronJob.stop(); _cronJob = null; }
  if (!cronExpr) return;
  if (!cron.validate(cronExpr)) {
    _logger?.log('warn', 'backup', `Некорректное cron-выражение: ${cronExpr}`);
    return;
  }
  _cronJob = cron.schedule(cronExpr, () => {
    _logger?.log('info', 'backup', `Авто-бекап по расписанию (${cronExpr})`);
    runBackup(destinations).catch(() => {});
  });
  _logger?.log('info', 'backup', `Авто-бекап запланирован: ${cronExpr}`);
}

// ── Восстановление из архива ──────────────────────────────────────────────────

async function restore(filename) {
  const file = getLocalPath(filename);
  if (!file) throw new Error('Файл бекапа не найден');

  _logger?.log('warn', 'backup', `Начало восстановления из ${filename}`);

  const zip = new AdmZip(file);
  const entries = zip.getEntries().map(e => e.entryName);

  const hasDb      = entries.some(e => e === 'signage.db');
  const hasUploads = entries.some(e => e.startsWith('uploads/'));

  if (!hasDb) throw new Error('Архив не содержит signage.db');

  // 1. Бекап текущего состояния перед заменой (на случай если что-то пойдёт не так)
  const safetyTs = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safetyFile = path.join(BACKUP_DIR, `pre-restore-${safetyTs}.zip`);
  try {
    await new Promise((resolve, reject) => {
      if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const out = fs.createWriteStream(safetyFile);
      const arc = archiver('zip', { zlib: { level: 1 } }); // быстрое сжатие
      out.on('close', resolve);
      arc.on('error', reject);
      arc.pipe(out);
      if (fs.existsSync(DB_PATH)) arc.file(DB_PATH, { name: 'signage.db' });
      arc.finalize();
    });
    _logger?.log('info', 'backup', `Текущее состояние сохранено: ${path.basename(safetyFile)}`);
  } catch (e) {
    _logger?.log('warn', 'backup', `Не удалось создать safety-бекап: ${e.message}`);
  }

  // 2. Восстанавливаем БД
  const dbEntry = zip.getEntry('signage.db');
  fs.writeFileSync(DB_PATH, dbEntry.getData());
  _logger?.log('info', 'backup', 'БД восстановлена');

  // 3. Восстанавливаем uploads если есть
  if (hasUploads) {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    zip.getEntries()
      .filter(e => e.entryName.startsWith('uploads/') && !e.isDirectory)
      .forEach(e => {
        const rel  = e.entryName.slice('uploads/'.length);
        const dest = path.join(UPLOADS_DIR, rel);
        const dir  = path.dirname(dest);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(dest, e.getData());
      });
    _logger?.log('info', 'backup', `Uploads восстановлены`);
  }

  _logger?.log('warn', 'backup', 'Восстановление завершено — перезапуск сервера...');

  // 4. Перезапуск процесса — Docker с restart:unless-stopped поднимет его снова
  setTimeout(() => process.exit(0), 500);
}

module.exports = { setLogger, runBackup, listLocal, getLocalPath, deleteLocal, scheduleCron, restore };
