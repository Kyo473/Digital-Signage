require('dotenv').config();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'ds_secret_change_in_production') {
  console.error('[DS] ОШИБКА: JWT_SECRET не установлен или используется дефолтное значение. Установите безопасный секрет в .env');
  process.exit(1);
}
const JWT_EXPIRES = process.env.JWT_EXPIRES || '30d';

let _db = null;
function setDb(db) { _db = db; }

let _logger = null;
function setLogger(l) { _logger = l; }

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    const level = req.method === 'HEAD' ? 'debug' : 'warn';
    _logger?.log(level, 'auth', `401 NO TOKEN  ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    if (_db) {
      const row = _db.prepare(
        'SELECT r.permissions FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id=?'
      ).get(req.user.id);
      if (!row) {
        _logger?.log('warn', 'auth', `401 USER NOT FOUND  id=${req.user.id}  ${req.method} ${req.path}`);
        return res.status(401).json({ error: 'Пользователь не найден' });
      }
      req.dbUser = { ...req.user, permissions: JSON.parse(row.permissions || '[]') };
    }
    next();
  } catch (e) {
    _logger?.log('warn', 'auth', `401 JWT ERROR  ${e.message}  token=${token.slice(0, 20)}...  ${req.method} ${req.path}`);
    res.status(401).json({ error: 'Токен недействителен или истёк' });
  }
}

// Проверяет наличие привилегии. Если передан getOwnerId — дополнительно
// проверяет _own vs _any логику для edit/delete операций.
function requirePerm(perm, getOwnerId) {
  return (req, res, next) => {
    // Всегда читаем permissions из БД через req.dbUser, установленный в requireAuth
    const perms = req.dbUser?.permissions || req.user?.permissions || [];

    if (perms.includes(perm)) return next();

    if (perm.endsWith('_any') && getOwnerId) {
      const ownPerm = perm.replace('_any', '_own');
      if (perms.includes(ownPerm)) {
        req._checkOwnership = true;
        req._ownPerm = ownPerm;
        req._getOwnerId = getOwnerId;
        return next();
      }
    }

    return res.status(403).json({ error: 'Недостаточно прав' });
  };
}

// Вызывается после загрузки записи из БД чтобы проверить владельца.
// NULL created_by означает что запись была создана до появления системы авторизации —
// редактировать её может только пользователь с правом _any (req._checkOwnership = false).
function checkOwnership(req, res, ownerId) {
  if (!req._checkOwnership) return true;
  if (ownerId && ownerId === req.user.id) return true;
  res.status(403).json({ error: 'Это не ваш объект' });
  return false;
}

module.exports = { signToken, requireAuth, requirePerm, checkOwnership, setDb, setLogger };
