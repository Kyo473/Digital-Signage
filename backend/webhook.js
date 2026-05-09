// Webhook dispatcher: emit(event, payload) — sends to all enabled webhooks subscribed to this event
const crypto = require('crypto');

let _db = null;
function setDb(db) { _db = db; }

let _logger = null;
function setLogger(l) { _logger = l; }

const RETRY_DELAYS = [2000, 5000, 10000]; // задержки между попытками в мс

async function dispatchWithRetry(hook, body, headers, event) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      let res;
      try {
        res = await fetch(hook.url, { method: 'POST', headers, body, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      if (attempt > 0) {
        _logger?.log('info', 'webhook', `retry ${attempt} succeeded: ${event} → ${hook.url}`, { event, hookId: hook.id, hookName: hook.name, attempt });
      }
      return; // успех
    } catch (err) {
      lastError = err;
      if (attempt < RETRY_DELAYS.length) {
        _logger?.log('warn', 'webhook', `attempt ${attempt + 1} failed: ${event} → ${hook.url}, retry in ${RETRY_DELAYS[attempt]}ms`, { event, hookId: hook.id, hookName: hook.name, error: err.message });
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      }
    }
  }
  // Все 4 попытки (1 + 3 retry) исчерпаны
  _logger?.log('error', 'webhook', `all retries failed: ${event} → ${hook.url}`, { event, hookId: hook.id, hookName: hook.name, error: lastError?.message });
}

async function emit(event, payload) {
  if (!_db) return;
  const hooks = _db.prepare('SELECT * FROM webhooks WHERE enabled=1').all();
  for (const hook of hooks) {
    const events = JSON.parse(hook.events || '[]');
    if (events.length > 0 && !events.includes(event)) continue;
    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
    const headers = { 'Content-Type': 'application/json', 'X-DS-Event': event };
    const sigKey = hook.secret || process.env.WEBHOOK_SECRET;
    if (sigKey) {
      const sig = crypto.createHmac('sha256', sigKey).update(body).digest('hex');
      headers['X-DS-Signature'] = 'sha256=' + sig;
    }
    _logger?.log('info', 'webhook', `dispatch ${event} → ${hook.url}`, { event, hookId: hook.id, hookName: hook.name });
    dispatchWithRetry(hook, body, headers, event); // fire-and-forget с retry внутри
  }
}

module.exports = { setDb, setLogger, emit };
