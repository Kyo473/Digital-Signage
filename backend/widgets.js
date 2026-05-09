'use strict';

// ── Weather ───────────────────────────────────────────────────────────────────
function buildWeatherHtml(p) {
  const unitSymbol = p.units === 'imperial' ? '°F' : '°C';
  const refresh = (Number(p.refreshInterval) || 600) * 1000;
  const showIcon = p.showIcon !== false;
  const showHumidity = p.showHumidity !== false;
  const showWind = p.showWind !== false;
  const fontSize = p.fontSize || 48;
  const apiUrl = p.apikey
    ? `/api/widgets/weather?city=${encodeURIComponent((p.city || 'Moscow').trim())}&apikey=${encodeURIComponent(p.apikey)}&units=${p.units || 'metric'}&lang=${p.lang || 'ru'}`
    : null;

  const fetchBlock = apiUrl ? `
  try {
    const r = await fetch('${apiUrl}');
    const d = await r.json();
    if (!r.ok) {
      const msg = r.status===401 ? 'Неверный API ключ OpenWeatherMap' : r.status===404 ? 'Город не найден' : (d.message||d.error||'Ошибка API '+r.status);
      el.innerHTML='<div class="err">'+msg+'</div>'; return;
    }
    const icon = ICON_MAP[d.weather[0].icon] || '🌡️';
    let html = '';
    if (${showIcon}) html += '<div class="icon">'+icon+'</div>';
    html += '<div class="temp">'+Math.round(d.main.temp)+'${unitSymbol}</div>';
    html += '<div class="city">'+d.name+'</div>';
    html += '<div class="desc">'+d.weather[0].description+'</div>';
    let meta = '';
    if (${showHumidity}) meta += '<span>💧 '+d.main.humidity+'%</span>';
    if (${showWind}) meta += '<span>💨 '+Math.round(d.wind.speed)+' м/с</span>';
    html += '<div class="meta">'+meta+'</div>';
    el.innerHTML = html;
  } catch(e) { el.innerHTML='<div class="err">Нет данных</div>'; }` : `
  el.innerHTML='<div class="err">API ключ не указан</div>';`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:${p.bgColor||'transparent'};font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden;color:${p.color||'#fff'}}
  #root{display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px;text-align:center}
  .temp{font-size:${fontSize}px;font-weight:700;line-height:1}
  .city{font-size:${Math.round(fontSize*0.5)}px;opacity:0.8;margin-top:4px}
  .desc{font-size:${Math.round(fontSize*0.4)}px;opacity:0.7;text-transform:capitalize}
  .icon{font-size:${Math.round(fontSize*1.2)}px}
  .meta{font-size:${Math.round(fontSize*0.35)}px;opacity:0.6;display:flex;gap:16px;margin-top:4px}
  .err{font-size:14px;opacity:0.5}
</style>
</head>
<body>
<div id="root"><div class="err">Загрузка...</div></div>
<script>
const ICON_MAP={'01d':'☀️','01n':'🌙','02d':'⛅','02n':'🌤','03d':'☁️','03n':'☁️','04d':'🌫','04n':'🌫','09d':'🌧','09n':'🌧','10d':'🌦','10n':'🌦','11d':'⛈','11n':'⛈','13d':'❄️','13n':'❄️','50d':'🌁','50n':'🌁'};
async function load() {
  const el = document.getElementById('root');
  ${fetchBlock}
}
load();
setInterval(load, ${refresh});
</script>
</body></html>`;
}

// ── Clock ─────────────────────────────────────────────────────────────────────
function buildClockHtml(p) {
  const locale = p.locale || 'ru-RU';
  const tz = p.timeZone || 'Europe/Moscow';
  const secOpt = p.showSeconds !== false ? ",second:'2-digit'" : '';
  const h12Opt = p.format24 !== false ? ',hour12:false' : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:${p.bgColor||'transparent'};font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden;color:${p.color||'#fff'}}
  #root{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;text-align:center;padding:16px}
  .time{font-size:${p.fontSize||72}px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-0.02em}
  .date{font-size:${Math.round((p.fontSize||72)*0.35)}px;opacity:0.75;margin-top:8px;font-weight:500}
</style>
</head>
<body>
<div id="root">
  <div class="time" id="time">00:00</div>
  ${p.showDate!==false?'<div class="date" id="date"></div>':''}
</div>
<script>
function tick(){
  const now=new Date();
  const opts={timeZone:'${tz}',hour:'2-digit',minute:'2-digit'${secOpt}${h12Opt}};
  document.getElementById('time').textContent=now.toLocaleTimeString('${locale}',opts);
  ${p.showDate!==false?`const dEl=document.getElementById('date');if(dEl)dEl.textContent=now.toLocaleDateString('${locale}',{timeZone:'${tz}',day:'2-digit',month:'long',year:'numeric',weekday:'long'});`:''}
}
tick();
setInterval(tick,1000);
</script>
</body></html>`;
}

// ── Currency ──────────────────────────────────────────────────────────────────
function buildCurrencyHtml(p) {
  const currencies = (p.currencies || 'USD,EUR,CNY').split(',').map(s => s.trim()).filter(Boolean);
  const refresh = (Number(p.refreshInterval) || 3600) * 1000;
  const showFlag = p.showFlag !== false;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:${p.bgColor||'transparent'};font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden;color:${p.color||'#fff'}}
  #root{display:flex;flex-direction:column;gap:10px;padding:16px;width:100%}
  .row{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .code{font-size:${p.fontSize||36}px;font-weight:700;line-height:1}
  .rate{font-size:${p.fontSize||36}px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1}
  .name{font-size:${Math.round((p.fontSize||36)*0.38)}px;opacity:0.55;line-height:1.2;margin-top:2px}
  .divider{height:1px;background:rgba(255,255,255,0.12)}
  .err{font-size:14px;opacity:0.5;text-align:center}
  .upd{font-size:${Math.round((p.fontSize||36)*0.28)}px;opacity:0.35;text-align:right;margin-top:4px}
</style>
</head>
<body>
<div id="root"><div class="err">Загрузка...</div></div>
<script>
const WANT=${JSON.stringify(currencies)};
const FLAGS={USD:'🇺🇸',EUR:'🇪🇺',GBP:'🇬🇧',CNY:'🇨🇳',JPY:'🇯🇵',CHF:'🇨🇭',TRY:'🇹🇷',KZT:'🇰🇿',BYN:'🇧🇾',UAH:'🇺🇦',AED:'🇦🇪',INR:'🇮🇳'};
const SHOW_FLAG=${showFlag};
async function load(){
  const el=document.getElementById('root');
  try{
    const r=await fetch('/api/widgets/currency');
    if(!r.ok)throw new Error('err');
    const data=await r.json();
    const v=data.Valute||{};
    const rows=WANT.map(code=>{
      const item=v[code];if(!item)return '';
      const rate=(item.Value/item.Nominal).toFixed(2);
      const flag=SHOW_FLAG?(FLAGS[code]||''):'';
      return '<div class="row"><div><div class="code">'+(flag?flag+' ':'')+code+'</div><div class="name">'+item.Name+'</div></div><div class="rate">'+rate+' ₽</div></div><div class="divider"></div>';
    }).filter(Boolean).join('');
    const t=new Date(data.Date).toLocaleString('ru',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    el.innerHTML=rows+'<div class="upd">обновлено '+t+'</div>';
  }catch(e){el.innerHTML='<div class="err">Нет данных ЦБ РФ</div>';}
}
load();
setInterval(load,${refresh});
</script>
</body></html>`;
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function buildCountdownHtml(p) {
  // targetDate is "YYYY-MM-DDTHH:MM" (datetime-local, no tz info).
  // Interpret it in the user-selected timezone by finding the UTC timestamp
  // that corresponds to that local time in the given zone.
  let target = 0;
  if (p.targetDate) {
    const tz = p.timeZone || 'Europe/Moscow';
    try {
      // Parse the local date string as if it's in the target timezone.
      // Strategy: format a known UTC date in target tz and adjust the diff.
      const localStr = p.targetDate.replace('T', ' '); // "2026-12-31 23:59"
      // Use Intl to find the UTC offset at that moment by binary search approximation:
      // Simpler: parse as UTC, then subtract the tz offset at that moment.
      const naiveUtc = new Date(p.targetDate + 'Z').getTime(); // treat as UTC first
      // Get what the tz offset is at naiveUtc (close enough for most cases)
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      });
      const parts = formatter.formatToParts(new Date(naiveUtc));
      const get = t => parts.find(x => x.type === t)?.value;
      // Reconstruct UTC from the tz-local representation
      const tzLocal = new Date(`${get('year')}-${get('month')}-${get('day')}T${get('hour').replace('24','00')}:${get('minute')}:${get('second')}Z`).getTime();
      const offset = naiveUtc - tzLocal; // tz offset in ms (positive = behind UTC)
      target = naiveUtc + offset;
    } catch {
      target = new Date(p.targetDate).getTime();
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:${p.bgColor||'transparent'};font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden;color:${p.color||'#fff'}}
  #root{display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px;text-align:center}
  .label{font-size:${Math.round((p.fontSize||56)*0.38)}px;opacity:0.65;font-weight:500;text-transform:uppercase;letter-spacing:0.08em}
  .units{display:flex;gap:16px;align-items:flex-end}
  .unit{display:flex;flex-direction:column;align-items:center;gap:4px}
  .val{font-size:${p.fontSize||56}px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;min-width:1.8ch;text-align:center}
  .cap{font-size:${Math.round((p.fontSize||56)*0.28)}px;opacity:0.55;text-transform:uppercase;letter-spacing:0.08em}
  .sep{font-size:${p.fontSize||56}px;font-weight:700;opacity:0.35;padding-bottom:10px}
  .done{font-size:${p.fontSize||56}px;font-weight:700}
</style>
</head>
<body>
<div id="root"></div>
<script>
const T=${target};
const SD=${p.showDays!==false},SH=${p.showHours!==false},SM=${p.showMinutes!==false},SS=${p.showSeconds!==false};
const LBL=${JSON.stringify(p.targetLabel||'До события')};
function pad(n){return String(n).padStart(2,'0');}
function tick(){
  const el=document.getElementById('root');
  if(!T){el.innerHTML='<div class="done">Дата не задана</div>';return;}
  const diff=Math.max(0,Math.floor((T-Date.now())/1000));
  if(diff<=0){el.innerHTML='<div class="label">'+LBL+'</div><div class="done">Время вышло!</div>';return;}
  const d=Math.floor(diff/86400),h=Math.floor(diff%86400/3600),m=Math.floor(diff%3600/60),s=diff%60;
  let parts=[];
  if(SD)parts.push('<div class="unit"><div class="val">'+d+'</div><div class="cap">дн</div></div>');
  if(SH){if(parts.length)parts.push('<div class="sep">:</div>');parts.push('<div class="unit"><div class="val">'+pad(h)+'</div><div class="cap">ч</div></div>');}
  if(SM){if(parts.length)parts.push('<div class="sep">:</div>');parts.push('<div class="unit"><div class="val">'+pad(m)+'</div><div class="cap">мин</div></div>');}
  if(SS){if(parts.length)parts.push('<div class="sep">:</div>');parts.push('<div class="unit"><div class="val">'+pad(s)+'</div><div class="cap">сек</div></div>');}
  el.innerHTML='<div class="label">'+LBL+'</div><div class="units">'+parts.join('')+'</div>';
}
tick();
setInterval(tick,1000);
</script>
</body></html>`;
}

// ── QR Code ───────────────────────────────────────────────────────────────────
function buildQrHtml(p) {
  const content = encodeURIComponent(p.content || 'https://example.com');
  const size = Math.max(64, Math.min(1024, Number(p.size) || 300));
  const fg = (p.fgColor || '#000000').replace('#', '');
  const bg = (p.bgColor || '#ffffff').replace('#', '');
  const margin = Number(p.margin) || 2;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${content}&color=${fg}&bgcolor=${bg}&margin=${margin}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:transparent;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}
  img{max-width:100%;max-height:100%;object-fit:contain;display:block}
</style>
</head>
<body>
<img src="${qrUrl}" alt="QR">
</body></html>`;
}

// ── RSS ───────────────────────────────────────────────────────────────────────
function buildRssHtml(p) {
  const feedUrl = p.feedUrl || '';
  const proxyUrl = feedUrl ? `/api/proxy?url=${encodeURIComponent(feedUrl)}` : '';
  const refresh = (Number(p.refreshInterval) || 300) * 1000;
  const showDate = p.showDate !== false;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:${p.bgColor||'transparent'};font-family:system-ui,sans-serif;color:${p.color||'#fff'};height:100vh;overflow:hidden;display:flex;flex-direction:column;padding:12px 16px}
  .item{padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.1)}
  .item:last-child{border-bottom:none}
  .title{font-size:${p.fontSize||24}px;font-weight:600;line-height:1.3;margin-bottom:4px}
  .date{font-size:${Math.round((p.fontSize||24)*0.5)}px;opacity:0.45}
  .err{font-size:14px;opacity:0.5;text-align:center;margin-top:20px}
</style>
</head>
<body>
<div id="root"><div class="err">${feedUrl ? 'Загрузка...' : 'URL ленты не указан'}</div></div>
<script>
const URL_='${proxyUrl}';
const MAX=${Number(p.maxItems)||5};
const SHOW_DATE=${showDate};
async function load(){
  if(!URL_)return;
  const el=document.getElementById('root');
  try{
    const r=await fetch(URL_);
    const txt=await r.text();
    const doc=new DOMParser().parseFromString(txt,'application/xml');
    const items=Array.from(doc.querySelectorAll('item')).slice(0,MAX);
    if(!items.length){el.innerHTML='<div class="err">Нет записей в ленте</div>';return;}
    el.innerHTML=items.map(it=>{
      const t=(it.querySelector('title')?.textContent||'').trim();
      const pub=it.querySelector('pubDate')?.textContent||'';
      const d=pub?new Date(pub).toLocaleDateString('ru',{day:'2-digit',month:'short'}):'';
      return '<div class="item"><div class="title">'+t+'</div>'+(SHOW_DATE&&d?'<div class="date">'+d+'</div>':'')+'</div>';
    }).join('');
  }catch(e){el.innerHTML='<div class="err">Ошибка загрузки RSS</div>';}
}
load();
setInterval(load,${refresh});
</script>
</body></html>`;
}

// ── Text Ticker ───────────────────────────────────────────────────────────────
function buildTextTickerHtml(p) {
  const speed = Math.max(10, Math.min(500, Number(p.speed) || 80));
  // duration in seconds: longer text + slower speed = longer animation
  const textLen = (p.text || '').length || 20;
  const duration = Math.max(5, Math.round(textLen * 0.15 * (100 / speed)));
  const text = (p.text || 'Бегущая строка').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:${p.bgColor||'transparent'};font-family:system-ui,sans-serif;color:${p.color||'#fff'};height:100vh;overflow:hidden;display:flex;align-items:center}
  @keyframes ticker{from{transform:translateX(100vw)}to{transform:translateX(-100%)}}
  .track{white-space:nowrap;display:inline-block;animation:ticker ${duration}s linear infinite}
  .seg{font-size:${p.fontSize||36}px;font-weight:600;display:inline-block;padding:0 80px}
</style>
</head>
<body>
<div class="track"><span class="seg">${text}</span><span class="seg">${text}</span></div>
</body></html>`;
}

// ── Entry point ───────────────────────────────────────────────────────────────
function buildWidgetHtml(type, props) {
  const p = props || {};
  switch (type) {
    case 'weather':     return buildWeatherHtml(p);
    case 'clock':       return buildClockHtml(p);
    case 'currency':    return buildCurrencyHtml(p);
    case 'countdown':   return buildCountdownHtml(p);
    case 'qr':          return buildQrHtml(p);
    case 'rss':         return buildRssHtml(p);
    case 'text_ticker': return buildTextTickerHtml(p);
    default:            return '<!DOCTYPE html><html><body style="background:transparent"></body></html>';
  }
}

module.exports = { buildWidgetHtml };
