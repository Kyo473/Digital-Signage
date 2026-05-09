// Service Worker: перехватывает запросы к /proxy-auth/* и добавляет Authorization header
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/proxy-auth/')) {
    // /proxy-auth/<base64creds>/<encoded-target-url>
    const parts = url.pathname.slice('/proxy-auth/'.length).split('/');
    const creds = parts[0]; // base64
    const targetUrl = decodeURIComponent(parts.slice(1).join('/') + (url.search || ''));
    event.respondWith(
      fetch(targetUrl, {
        headers: {
          ...Object.fromEntries(event.request.headers),
          'Authorization': `Basic ${creds}`,
        },
        credentials: 'omit',
      })
    );
  }
});
