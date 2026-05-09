const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    ['/api', '/uploads'],
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
      // Do NOT use the SPA fallback for these paths — always forward to backend
    })
  );
};
