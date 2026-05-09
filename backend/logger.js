const fs = require('fs');
const path = require('path');

// ── Конфиг ───────────────────────────────────────────────────────────────────

const MAX_MEM   = 2000;          // записей в памяти (для быстрого API)
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — максимальный размер одного файла
const MAX_FILES = 5;             // сколько ротированных файлов хранить

const LOG_DIR  = process.env.LOG_DIR || path.join(__dirname, 'data');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

// ── Инициализация файлового хранилища ────────────────────────────────────────

try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (e) {
  console.error('[logger] Cannot create log dir:', e.message);
}

let _stream = null;

function openStream() {
  try {
    _stream = fs.createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf8' });
    _stream.on('error', err => {
      console.error('[logger] Write stream error:', err.message);
      _stream = null;
    });
  } catch (e) {
    console.error('[logger] Cannot open log file:', e.message);
  }
}

openStream();

// ── Ротация ──────────────────────────────────────────────────────────────────

function rotate() {
  try {
    if (_stream) { _stream.end(); _stream = null; }

    // Сдвигаем старые файлы: app.log.4 удаляем, .3→.4, .2→.3, .1→.2, app.log→.1
    for (let i = MAX_FILES - 1; i >= 1; i--) {
      const from = `${LOG_FILE}.${i}`;
      const to   = `${LOG_FILE}.${i + 1}`;
      if (fs.existsSync(from)) {
        if (i === MAX_FILES - 1) fs.unlinkSync(from);
        else fs.renameSync(from, to);
      }
    }
    if (fs.existsSync(LOG_FILE)) fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);

    openStream();
  } catch (e) {
    console.error('[logger] Rotation error:', e.message);
    openStream();
  }
}

function checkRotation() {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_BYTES) rotate();
  } catch { /* ignore */ }
}

// ── Кольцевой буфер в памяти ─────────────────────────────────────────────────

const logs = [];
let seq = 0;

// ── Загрузка последних записей из файла при старте ──────────────────────────

function loadFromFile() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    // Берём последние MAX_MEM строк
    const tail = lines.slice(-MAX_MEM);
    for (const line of tail) {
      try {
        const entry = JSON.parse(line);
        logs.push(entry);
        if (entry.id > seq) seq = entry.id;
      } catch { /* skip malformed lines */ }
    }
  } catch (e) {
    console.error('[logger] Cannot load logs from file:', e.message);
  }
}

loadFromFile();

// ── Основные функции ─────────────────────────────────────────────────────────

function log(level, category, message, meta = {}) {
  const entry = {
    id: ++seq,
    ts: Date.now(),
    level,
    category,
    message,
    meta,
  };

  // Память
  logs.push(entry);
  if (logs.length > MAX_MEM) logs.shift();

  // Файл (все уровни включая debug)
  if (_stream) {
    checkRotation();
    _stream.write(JSON.stringify(entry) + '\n');
  }

  // stdout (debug не пишем)
  if (level === 'debug') return;
  const prefix = `[${new Date(entry.ts).toISOString()}] [${level.toUpperCase()}] [${category}]`;
  if (level === 'error') console.error(prefix, message, Object.keys(meta).length ? meta : '');
  else console.log(prefix, message, Object.keys(meta).length ? meta : '');
}

function getLogs({ level, category, search, limit = 500, before } = {}) {
  let result = [...logs];
  if (before) result = result.filter(e => e.id < before);
  if (level)  result = result.filter(e => e.level === level);
  else        result = result.filter(e => e.level !== 'debug');
  if (category) result = result.filter(e => e.category === category);
  if (search) {
    const s = search.toLowerCase();
    result = result.filter(e =>
      e.message.toLowerCase().includes(s) ||
      JSON.stringify(e.meta).toLowerCase().includes(s)
    );
  }
  return result.slice(-limit).reverse();
}

// Читает логи из файлов на диске (для экспорта больше чем MAX_MEM записей)
function getLogsFromDisk({ level, category, search, limit = 5000 } = {}) {
  const files = [];
  // Собираем файлы от старых к новым
  for (let i = MAX_FILES; i >= 1; i--) {
    const f = `${LOG_FILE}.${i}`;
    if (fs.existsSync(f)) files.push(f);
  }
  if (fs.existsSync(LOG_FILE)) files.push(LOG_FILE);

  let result = [];
  for (const file of files) {
    try {
      const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try { result.push(JSON.parse(line)); } catch { /* skip */ }
      }
    } catch { /* skip unreadable file */ }
  }

  if (level)    result = result.filter(e => e.level === level);
  else          result = result.filter(e => e.level !== 'debug');
  if (category) result = result.filter(e => e.category === category);
  if (search) {
    const s = search.toLowerCase();
    result = result.filter(e =>
      e.message.toLowerCase().includes(s) ||
      JSON.stringify(e.meta).toLowerCase().includes(s)
    );
  }

  return result.slice(-limit).reverse();
}

function clear() {
  logs.length = 0;
  // Очищаем текущий файл и все ротированные
  try {
    if (_stream) { _stream.end(); _stream = null; }
    for (let i = MAX_FILES; i >= 1; i--) {
      const f = `${LOG_FILE}.${i}`;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);
    openStream();
  } catch (e) {
    console.error('[logger] Clear error:', e.message);
    openStream();
  }
}

module.exports = { log, getLogs, getLogsFromDisk, clear };
