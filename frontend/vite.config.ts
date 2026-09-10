import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// `vite dev` only: send "/" to the test page. `configureServer` is a plugin
// hook, not a `server` option — it lived in the wrong place and broke the build.
const rootToIndex = (): Plugin => ({
  name: 'root-to-index',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/') {
        res.writeHead(302, { Location: '/index.html' });
        res.end();
        return;
      }
      next();
    });
  },
});

// Machine-specific host for `vite dev` (nip.io domain of this box). Not used by
// `vite build` — the Docker nginx serves the static dist/ and proxies /api itself.
const DEV_HOST = process.env.VITE_DEV_HOST || 'localhost';

export default defineConfig({
  plugins: [react(), rootToIndex()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: [DEV_HOST],
    proxy: {
      '/api': {
        target: `http://${DEV_HOST}:9000`,
        changeOrigin: true,
      },
    },
  },
});

















//import { defineConfig } from 'vite'
//import react from '@vitejs/plugin-react'
//
//// https://vite.dev/config/
//export default defineConfig({
//  plugins: [react()],
//})
