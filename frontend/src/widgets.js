// Widget utilities — frontend side
// Widgets are rendered by the backend at /api/widgets/render?type=X&p=<base64>
// This avoids blob: URL + sandbox restrictions.

export const WIDGET_TYPES = [
  { key: 'weather',     label: 'Погода',           icon: '🌤', color: '#2eaadc', desc: 'Текущая погода (OpenWeatherMap)' },
  { key: 'clock',       label: 'Часы / Дата',       icon: '🕐', color: '#7c5cfc', desc: 'Живые часы без внешнего API' },
  { key: 'currency',    label: 'Курсы валют',        icon: '💱', color: '#10b981', desc: 'Курсы ЦБ РФ (USD, EUR и др.)' },
  { key: 'countdown',   label: 'Обратный отсчёт',   icon: '⏳', color: '#f59e0b', desc: 'Таймер до заданной даты' },
  { key: 'qr',          label: 'QR-код',             icon: '⬛', color: '#6366f1', desc: 'QR-код для URL или текста' },
  { key: 'rss',         label: 'RSS лента',          icon: '📰', color: '#ef4444', desc: 'Заголовки из RSS-ленты' },
  { key: 'text_ticker', label: 'Бегущая строка',     icon: '📢', color: '#e05c8a', desc: 'Анимированная строка текста' },
];

export const WIDGET_DEFAULTS = {
  weather: {
    city: 'Moscow',
    apikey: '',
    units: 'metric',
    lang: 'ru',
    fontSize: 48,
    color: '#ffffff',
    bgColor: 'transparent',
    showIcon: true,
    showHumidity: true,
    showWind: true,
    refreshInterval: 600,
  },
  clock: {
    format24: true,
    showSeconds: true,
    showDate: true,
    locale: 'ru-RU',
    timeZone: 'Europe/Moscow',
    fontSize: 72,
    color: '#ffffff',
    bgColor: 'transparent',
    fontFamily: 'Inter',
  },
  currency: {
    currencies: 'USD,EUR,CNY',
    fontSize: 36,
    color: '#ffffff',
    bgColor: 'transparent',
    showFlag: true,
    refreshInterval: 3600,
  },
  countdown: {
    targetDate: '',
    targetLabel: 'До события',
    timeZone: 'Europe/Moscow',
    fontSize: 56,
    color: '#ffffff',
    bgColor: 'transparent',
    showDays: true,
    showHours: true,
    showMinutes: true,
    showSeconds: true,
  },
  qr: {
    content: 'https://example.com',
    size: 300,
    fgColor: '#000000',
    bgColor: '#ffffff',
    margin: 2,
  },
  rss: {
    feedUrl: '',
    maxItems: 5,
    fontSize: 24,
    color: '#ffffff',
    bgColor: 'transparent',
    showDate: true,
    refreshInterval: 300,
  },
  text_ticker: {
    text: 'Добро пожаловать! Бегущая строка.',
    fontSize: 36,
    color: '#ffffff',
    bgColor: 'transparent',
    speed: 80,
  },
};

// Build the iframe src URL — backend renders the HTML at this endpoint
// Uses base64url (RFC 4648 §5) — no +/= chars, safe in URL query without encoding
export function buildWidgetUrl(type, props) {
  const p = JSON.stringify(props || {});
  const b64 = btoa(unescape(encodeURIComponent(p)));
  const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `/api/widgets/render?type=${encodeURIComponent(type)}&p=${b64url}`;
}
